const appName = "ContactHistoryApp";
const platformClient = require("platformClient");
const clientId = "ca9b9d2c-978e-4da4-a731-f4ede41258cc";
const MEDIATYPE_VOICE = "voice";
const MEDIATYPE_EMAIL = "email";
const GC_DAID_EMAIL_HISTORY = "0cc11cf8-d52d-4cb8-9830-dbf97260daaf";
const GC_DAID_VOICE_HISTORY = "8f198410-a349-4932-922a-d311f0e5e2c8";

const client = platformClient.ApiClient.instance;
client.setEnvironment("mypurecloud.de");
client.setPersistSettings(true, appName);

const redirectUri = window.location.origin + window.location.pathname;
let conversationId = undefined;
let conversationMediaType = undefined;
let historySearchValue = undefined;

var usersApi = new platformClient.UsersApi();
var conversationsApi = new platformClient.ConversationsApi();
var integrationsApi = new platformClient.IntegrationsApi();
var routingApi = new platformClient.RoutingApi();
var searchResults = undefined;
var userJid = "";

// COMMENT OUT WHEN WORKING ON (UNSECURE) LOCALHOST
// upgrade to https
//if (location.protocol !== "https:") {
//  location.replace(
//    `https:${location.href.substring(location.protocol.length)}`
//  );
//}

var queryString = window.location.search.substring(1);
var pairs = queryString.split('&');
let hasQueryParameters = false;

// Transpose Data Action data from (column) arrays into (row) an array of individual records. Exclude unwanted attributes like TotalHits
function transposeDataActionResults(sourceData) {
  let resultSet = [];
  if (sourceData.TotalHits) {
    for (var idx = 0; idx < sourceData.TotalHits; idx++) {
      var newRecord = {}

      for (const [key, value] of Object.entries(sourceData)) {
        if (key !== 'TotalHits') {
          newRecord[key] = value[idx];
        }
      }
      resultSet.push(newRecord);
    }
  }
  return resultSet;
}

function renderSearchResults() {
  console.log(`Rendering results for ${searchResults.length} records...`)
  let resultsHtml = "";
  if (searchResults.length > 0) {
    resultsHtml += "<table class='info-table'><tr class='info-table'>";
    // Take headers from first record
    for (const [key, value] of Object.entries(searchResults[0])) {
      resultsHtml += `<td class='info-table'>${key}</td>`;
    }
    resultsHtml += "</tr>";

    searchResults.forEach((record) => {
      resultsHtml += "<tr class='info-table'>";
      for (const [key, value] of Object.entries(record)) {
        resultsHtml += `<td class='info-table'>${value}</td>`;
      }
      resultsHtml += "</tr>";
    });
    resultsHtml += "</table>"
  }
  else {
    resultsHtml = "No results";
  }

  // show search results
  $("#search-results").html(resultsHtml);
  $("#search-results").removeClass("hidden");
}

// authenticate!
$(document).ready(() => {
  let state = "";

  for (let i = 0; i < pairs.length; i++) {
    var currParam = pairs[i].split('=');
    if (currParam[0] === 'conversationId') {
      conversationId = currParam[1];
      hasQueryParameters = true;
    }
  }
  if (hasQueryParameters) {
    state = conversationId;
  }

  client
  .loginImplicitGrant(clientId, redirectUri, { state: state })
  .then((data) => {
    // Do authenticated things
    bootstrap();
  })
  .catch((err) => {
    // Handle failure response
    console.error(err);
    bootstrapError();
  });
});

// Section: Bootstrap

function bootstrapError() {
  $("#loading").addClass("hidden");
  $("#auth-failure").removeClass("hidden");
}

async function bootstrap() {
  if (conversationId != undefined) {
    const conversationIdElement = document.getElementById('conversation-id');
    conversationIdElement.innerText = conversationId;

    const promise = fetchConversationDetails(conversationId);
    promise.then((mediaType) => {
      const mediaTypeElement = document.getElementById('conversation-mediatype');
      mediaTypeElement.innerText = conversationMediaType;

      const searchValueElement = document.getElementById('history-searchvalue');
      searchValueElement.innerText = historySearchValue;
    });

    // Set up form controls
    $("#retrieve-history").on(
      "click",
      debounce((e) => {
        retrieveHistory(conversationMediaType, historySearchValue);
      }, 300)
    );
  }

  usersApi
    .getUsersMe()
    .then((data) => {
      if (data.chat) {
        userJid = data.chat.jabberId;
      }
      // show ui
      $("#loading").addClass("hidden");
      $("#main-app").removeClass("hidden");
    })
    .catch((err) => {
      console.error(err);
    });
}

async function fetchAgentNames(agentIds) {
  let result = undefined;
  const options = {
    "pageSize": 100,
    "pageNumber": 1,
    id: agentIds
  }
  await usersApi.getUsers(options)
  .then((data) => {
    //console.log(`getUsers success! data: ${JSON.stringify(data, null, 2)}`);
    result = data.entities;
  })
  .catch((err) => {
    console.log("There was a failure calling getUsers");
    console.error(err);
  });
  return result;
}

async function fetchQueueNames(queueIds) {
  let result = undefined;
  const options = {
    "pageSize": 100,
    "pageNumber": 1,
    id: queueIds
  }
  await routingApi.getRoutingQueues(options)
  .then((data) => {
    //console.log(`getRoutingQueues success! data: ${JSON.stringify(data, null, 2)}`);
    result = data.entities;
  })
  .catch((err) => {
    console.log("There was a failure calling getRoutingQueues");
    console.error(err);
  });
  return result;
}

// Fetch basic conversation details, like media type and the contact value to use later for history search
// (either email or ANI)
async function fetchConversationDetails(conversationId) {
  await conversationsApi
    .getConversation(conversationId)
    .then((data) => {
      // From first participant, determine media type. Bit quick and dirty, but it will work for now
      //console.log(`fetchConversationDetails success! data: ${JSON.stringify(data, null, 2)}`);
      if (data.participants.length > 0) {
        if (data.participants[0].calls.length > 0) {
          conversationMediaType = MEDIATYPE_VOICE;
          historySearchValue = data.participants[0].ani;
        }
        else {
          if (data.participants[0].emails.length > 0) {
            conversationMediaType = MEDIATYPE_EMAIL;
            historySearchValue = data.participants[0].address;
          }
        }
      }
    })
    .catch((err) => {
      console.log("There was a failure calling fetchConversationDetails");
      console.error(err);
    });
}

// Calculate a query interval for GC, based on number of historical days before current date/time
function convertHistoryDaysToInterval(historyDays) {
  const lastDay = new Date();
  const firstDay = new Date(lastDay);
  firstDay.setDate(firstDay.getDate() - historyDays);

  return `${firstDay.toISOString().split('T')[0]}T00:00:00/${lastDay.toISOString().split('.')[0]}`;
}

// Retrieve history, using mediatype to differentiate between GC Data Action to invoke
async function retrieveHistory(mediaType, searchValue) {
  const intervalSlider = document.getElementById('interval-range');
  const interval = convertHistoryDaysToInterval(intervalSlider.value);

  if (mediaType === MEDIATYPE_VOICE) {
    //const body = {
    //  'ANI': searchValue,
    //  'Interval': interval
    //}
    //await fetchFromDataAction(GC_DAID_VOICE_HISTORY, body);
    searchResults = await fetchAnalyticsVoiceHistory(searchValue, interval);
    //console.log(searchResults);
  }
  else {
    if (mediaType === MEDIATYPE_EMAIL) {
      //const body = {
      //  'FromAddress': searchValue,
      //  'Interval': interval
      //};
      //await fetchFromDataAction(GC_DAID_EMAIL_HISTORY, body);
      searchResults = await fetchAnalyticsEmailHistory(searchValue, interval);
      //console.log(searchResults);
    }
    else {
      console.log(`Cannot retrieve history for media type ${mediaType}: not implemented`);
    }
  }

  renderSearchResults();
}

// Fetch data from GC Data Action
async function fetchFromDataAction(dataActionId, dataActionBody) {
  let result = undefined;
  await integrationsApi
    .postIntegrationsActionExecute(dataActionId, dataActionBody)
    .then((data) => {
      //console.log(`postIntegrationsActionExecute success! data: ${JSON.stringify(data, null, 2)}`);
      result = data;
    })
    .catch((err) => {
      console.log("There was a failure calling postIntegrationsActionExecute");
      console.error(err);
      result = undefined;
    });
  return result;
}

// Temporary (?) function
async function fetchAnalyticsEmailHistory(emailAddress, interval) {
  const queryBody = 
  {
    "segmentFilters": [
      {
        "type": "and",
        "clauses": [
          {
            "type": "and",
            "predicates": [
              {
                "type": "dimension",
                "dimension": "addressFrom",
                "operator": "matches",
                "value": emailAddress
              }
            ]
          }
        ]
      },
      {
        "type": "and",
        "clauses": [
          {
            "type": "and",
            "predicates": [
              {
                "type": "dimension",
                "dimension": "mediaType",
                "operator": "matches",
                "value": "email"
              }
            ]
          }
        ]
      }
    ],
    "order": "desc",
    "orderBy": "conversationStart",
    "interval": interval
  };

  let result = undefined;
  await conversationsApi
    .postAnalyticsConversationsDetailsQuery(queryBody)
    .then((data) => {
      // console.log(`postAnalyticsConversationsDetailsQuery success! data: ${JSON.stringify(data, null, 2)}`);
      result = data;
    })
    .catch((err) => {
      console.log("There was a failure calling postIntegrationsActionExecute");
      console.error(err);
      result = undefined;
    });

  if (result != undefined) {
    const daMockData = {
      "TotalHits": jsonPath(result, "$.totalHits"),
      "conversationStart": jsonPath(result, "$.conversations[*].conversationStart"),
      "Agent": jsonPath(result, "$.conversations[*].participants[?(@.purpose == 'agent')].userId"),
      //"Queue": jsonPath(result, "$.conversations[*].participants[?((@.purpose=='acd' || @.purpose=='agent') && @.sessions[?(@.segments[?(@.segmentType=='interact' && @.disconnectType!='transfer')] empty false)] empty false)].sessions[0].segments[0].queueId"),
      "addressTo": jsonPath(result, "$.conversations[*].participants[0].sessions[0].addressTo")
    }

    const uniqueAgents = (daMockData === true) ? [...new Set(daMockData["Agent"])] : [];
    const uniqueAgentData = (uniqueAgents != undefined) ? await fetchAgentNames(uniqueAgents) : [];
    let transposedDataSet = transposeDataActionResults(daMockData);
    for (let idx = 0; idx < transposedDataSet.length; idx++) {
      let record = transposedDataSet[idx];
      const agentDataFilter = uniqueAgentData.filter(agent => agent.id === record["Agent"]);
      record["AgentName"] = (agentDataFilter != undefined) ? agentDataFilter[0].name : '-';
    }
    return transposedDataSet;
  }
  else {
    return undefined;
  }
}

// Temporary (?) function
async function fetchAnalyticsVoiceHistory(ani, interval) {
  const queryBody = 
  {
    "segmentFilters": [
      {
        "type": "and",
        "clauses": [
          {
            "type": "and",
            "predicates": [
              {
                "type": "dimension",
                "dimension": "ani",
                "operator": "matches",
                "value": ani
              }
            ]
          }
        ]
      },
      {
        "type": "and",
        "clauses": [
          {
            "type": "and",
            "predicates": [
              {
                "type": "dimension",
                "dimension": "mediaType",
                "operator": "matches",
                "value": "voice"
              }
            ]
          }
        ]
      }
    ],
    "order": "desc",
    "orderBy": "conversationStart",
    "interval": interval
  };

  let result = undefined;
  await conversationsApi
    .postAnalyticsConversationsDetailsQuery(queryBody)
    .then((data) => {
      //console.log(`postAnalyticsConversationsDetailsQuery success! data: ${JSON.stringify(data, null, 2)}`);
      result = data;
    })
    .catch((err) => {
      console.log("There was a failure calling postIntegrationsActionExecute");
      console.error(err);
      result = undefined;
    });

  if (result != undefined) {
    const daMockData = {
      "TotalHits": jsonPath(result, "$.totalHits"),
      "conversationStart": jsonPath(result, "$.conversations[*].conversationStart"),
      "Agent": jsonPath(result, "$.conversations[*].participants[?(@.purpose == 'agent')].userId"),
      "dnis": jsonPath(result, "$.conversations[*].participants[0].sessions[0].dnis"),
      "Queue": jsonPath(result, "$.conversations[*].participants[?(@.purpose == 'acd')].participantName")
    }

    const uniqueAgents = (daMockData === true) ? [...new Set(daMockData["Agent"])] : [];
    const uniqueAgentData = (uniqueAgents != undefined) ? await fetchAgentNames(uniqueAgents) : [];
    //const uniqueQueues = (daMockData === true) ? [...new Set(daMockData["Queue"])] : [];
    //const uniqueQueueData = (uniqueQueues != undefined) ? await fetchQueueNames(uniqueQueues) : [];
    let transposedDataSet = transposeDataActionResults(daMockData);
    for (let idx = 0; idx < transposedDataSet.length; idx++) {
      let record = transposedDataSet[idx];
      const agentDataFilter = uniqueAgentData.filter(agent => agent.id === record["Agent"]);
      record["AgentName"] = (agentDataFilter != undefined) ? agentDataFilter[0].name : '-';

      // const queueDataFilter = uniqueQueueData.filter(queue => queue.id === record["Queue"]);
      // record["QueueName"] = (queueDataFilter != undefined) ? queueDataFilter[0].name : '-';
    }

    return transposedDataSet;
  }
  else {
    return undefined;
  }
}
