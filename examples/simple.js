// simple server with a protected resource at /secret secured by OAuth 2

var OAuth2Provider = require('../index').OAuth2Provider,
           connect = require('connect'),
       MemoryStore = connect.session.MemoryStore;

// hardcoded list of <client id, client secret> tuples
var myClients = {
 '1': '1secret',
};

// temporary grant storage
var myGrants = {};

var myOAP = new OAuth2Provider('encryption secret', 'signing secret');

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, next) {
  if(req.session.user) {
    next();
  } else {
    res.writeHead(303, {Location: '/login?next=' + encodeURIComponent(authorize_url)});
    res.end();
  }
});

// render the authorize form with the submission URL
// use two submit buttons named "allow" and "deny" for the user's choice
myOAP.on('authorize_form', function(req, res, authorize_url) {
  res.end('<html>this app wants to access your dialoggs account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code) {
  if(!(req.session.user in myGrants))
    myGrants[req.session.user] = {};

  myGrants[req.session.user][client_id] = code;
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(req, user_id, client_id, code) {
  if(myGrants[user_id] && myGrants[user_id][client_id])
    delete myGrants[user_id][client_id];
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, next) {
  // verify that client id/secret pair are valid
  if(client_id in myClients && myClients[client_id] == client_secret) {
    for(var user in myGrants) {
      var clients = myGrants[user];

      if(clients[client_id] && clients[client_id] == code)
        return next(null, user);
    }
  }

  next(new Error('no such grant found'));
});

// an access token was received in a URL query string parameter or HTTP header
myOAP.on('access_token', function(req, user_id, client_id, next) {
  req.session.user = user_id;
  next();
});

function router(app) {
  app.get('/', function(req, res, next) {
    res.end('home, logged in? ' + !!req.session.user);
  });

  app.get('/login', function(req, res, next) {
    if(req.session.user) {
      res.writeHead(303, {Location: '/'});
      return res.end();
    }

    var next_url = req.query.next ? req.query.next : '/';

    res.end('<html><form method="post" action="/login"><input type="hidden" name="next" value="' + next_url + '"><input type="text" placeholder="username" name="username"><input type="password" placeholder="password" name="password"><button type="submit">Login</button></form>');
  });

  app.post('/login', function(req, res, next) {
    req.session.user = req.body.username;

    res.writeHead(303, {Location: req.body.next || '/'});
    res.end();
  });

  app.get('/logout', function(req, res, next) {
    req.session.destroy(function(err) {
      res.writeHead(303, {Location: '/'});
      res.end();
    });
  });

  app.get('/secret', function(req, res, next) {
    if(req.session.user) {
      res.end('proceed to secret lair');
    } else {
      res.writeHead(403);
      res.end('no');
    }
  });
}

connect.createServer(
  connect.logger(),
  connect.bodyParser(),
  connect.query(),
  connect.cookieParser(),
  connect.session({store: new MemoryStore({reapInterval: 5 * 60 * 1000}), secret: 'abracadabra'}),
  myOAP.oauth(),
  myOAP.login(),
  connect.router(router)
).listen(8081);

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

