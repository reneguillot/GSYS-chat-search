const platformClient = require("platformClient");
const clientId = "ca9b9d2c-978e-4da4-a731-f4ede41258cc";
const redirectUri =
  "https://reneguillot.github.io/GSYS-chat-search";
const client = platformClient.ApiClient.instance;
var md = window.markdownit();
var state = "";
var searchApi = new platformClient.SearchApi();
var usersApi = new platformClient.UsersApi();
var searchResults = [];
var userJid = "";

// upgrade to https
if (location.protocol !== "https:") {
  location.replace(
    `https:${location.href.substring(location.protocol.length)}`
  );
}

// authenticate!
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

// Section: Bootstrap

function bootstrapError() {
  $("#loading").addClass("hidden");
  $("#auth-failure").removeClass("hidden");
}

function bootstrap() {
  // set up form controls
  $("#search-input").on(
    "input",
    debounce((e) => {
      searchChats(e.target.value);
    }, 300)
  );

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

// Section: Search

function searchChats(term) {
  // if empty term, hide results
  if (!term) {
    $("#search-results").addClass("hidden");
    return;
  }

  let body = {
    sortOrder: "SCORE",
    pageSize: 50,
    expand: ["from", "to"],
    types: ["messages"],
    query: [
      {
        value: term,
        fields: ["body"],
        type: "TERM",
      },
    ],
  };
  searchApi
    .postSearch(body, { profile: false })
    .then((data) => {
      getSearchResults(data);
    })
    .catch((err) => {
      console.error(err);
    });
}

function getSearchResults(data) {
  searchResults = [];

  // if results came back, add each to results cache
  if (data.hasOwnProperty("results")) {
    data.results.forEach((chat) => {
      // initialize user info
      var name = "Person";
      var image = "person.svg";
      var from = "";
      var to = "";

      if (chat.from.name) {
        name = chat.from.name;
      }

      if (
        chat.from.images &&
        chat.from.images.length > 0 &&
        chat.from.images[0].imageUri
      ) {
        image = chat.from.images[0].imageUri;
      }

      if (chat.from.chat) {
        from = chat.from.chat.jabberId;
      } else {
        from = chat.from.jid;
      }

      if (chat.to.chat) {
        to = chat.to.chat.jabberId;
      } else {
        to = chat.to.jid;
      }

      // create chat object and add it to the search result cache
      let chatResult = {
        fromJid: from,
        targetJid: to,
        body: chat.body,
        created: chat.created,
        userName: name,
        image: image,
      };
      searchResults.push(chatResult);
    });
  }

  // render results
  renderSearchResults();
}

function renderSearchResults() {
  let resultsHtml = "";

  searchResults.forEach((chatResult) => {
    var targetId = "";

    // if the target JID is the current user's JID, that means this is a DM, so open the chat matching the from JID.
    if (chatResult.targetJid == userJid) {
      targetId = chatResult.fromJid;
    } else {
      targetId = chatResult.targetJid;
    }

    resultsHtml += `<div class="search-result"><div class="search-result-details"><img src="${
      chatResult.image
    }" width="24" height="24"><span class="search-result-details-name">${
      chatResult.userName
    }</span><span class="search-result-details-date">${new Date(
      chatResult.created
    ).toLocaleString()}</span><span class="search-result-details-open"><a href="https://apps.mypurecloud.com/directory/#/chat-room/${targetId}" target="_blank" title="Open chat room"><i class="fa fa-external-link-square" aria-hidden="true"></i></a>
</span></div><div class="search-result-body">${md.render(
      chatResult.body
    )}</div></div>`;
  });

  // if no results, show placeholder value
  if (resultsHtml.length < 1) {
    resultsHtml = "No results. Your search must be at least 4 characters long.";
  }

  // show search results
  $("#search-results").html(resultsHtml);
  $("#search-results").removeClass("hidden");
}
