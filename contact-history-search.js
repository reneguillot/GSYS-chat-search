const appName = "ContactHistoryApp";
const platformClient = require("platformClient");
const clientId = "ca9b9d2c-978e-4da4-a731-f4ede41258cc";
const MEDIATYPE_VOICE = "voice";
const MEDIATYPE_EMAIL = "email";
const GC_DAID_EMAIL_HISTORY = "8f198410-a349-4932-922a-d311f0e5e2c8";
const GC_DAID_VOICE_HISTORY = "0cc11cf8-d52d-4cb8-9830-dbf97260daaf";

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
var searchResults = [];
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

    console.log(conversationId);
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

// Fetch basic conversation details, like media type and the contact value to use later for history search
// (either email or ANI)
async function fetchConversationDetails(conversationId) {
  await conversationsApi
    .getConversation(conversationId)
    .then((data) => {
      // From first participant, determine media type. Bit quick and dirty, but it will work for now
      console.log(`fetchConversationDetails success! data: ${JSON.stringify(data, null, 2)}`);
      //console.log(data.participants.length);
      if (data.participants.length > 0) {
        if (data.participants[0].calls.length > 0) {
          conversationMediaType = MEDIATYPE_VOICE;
          historySearchValue = MEDIATYPE_VOICE;
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
  console.log(interval);

  if (mediaType === MEDIATYPE_VOICE) {
    const body = {
      'FromAddress': searchValue,
      'Interval': interval
    };
    await fetchFromDataAction(GC_DAID_VOICE_HISTORY, body);
  }
  else {
    if (mediaType === MEDIATYPE_EMAIL) {
      const body = {
        'ANI': searchValue,
        'Interval': interval
      }
      await fetchFromDataAction(GC_DAID_EMAIL_HISTORY, body);
    }
    else {
      console.log(`Cannot retrieve history for media type ${mediaType}: not implemented`);
    }
  }
}

// Fetch data from GC Data Action
async function fetchFromDataAction(dataActionId, dataActionBody) {
  let result = undefined;
  await integrationsApi
    .postIntegrationsActionExecute(dataActionId, dataActionBody)
    .then((data) => {
      console.log(`postIntegrationsActionExecute success! data: ${JSON.stringify(data, null, 2)}`);
      result = data;
    })
    .catch((err) => {
      console.log("There was a failure calling postIntegrationsActionExecute");
      console.error(err);
      result = undefined;
    });
  return result;
}