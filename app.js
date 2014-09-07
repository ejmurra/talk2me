var express = require('express')
, passport = require('passport')
, util = require('util')
, FacebookStrategy = require('passport-facebook').Strategy;

var FACEBOOK_APP_ID = "756951677690205"
var FACEBOOK_APP_SECRET = "4d350b7d819c72857fc49c8a5018dd9d";

var my_clients = {};

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

passport.use(new FacebookStrategy({
    clientID: FACEBOOK_APP_ID,
    clientSecret: FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'photos']
},
function(accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
        return done(null, profile);
    });
}
));

var app = express();

// configure Express
app.configure(function() {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.logger());
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.session({ secret: 'keyboard cat' }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.get('/', function(req, res){
    console.log("My clients: ");
    console.log(my_clients);
    res.render('layout', { user: req.user, body: null });
});

app.get('/account', ensureAuthenticated, function(req, res){
    // Pull data
    res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
    res.render('login', { user: req.user });
});

// Data Printer
app.get('/api/get_data', ensureAuthenticated, function (req, res){
    res.send(my_clients[req.user.id]);
});

app.get('/api/profile', ensureAuthenticated, function(req, res){
    var proposed_friend_id = req.query.friend_id;
    
    // Check if proposed friend id exists
    if(my_clients[proposed_friend_id] === undefined){
        res.send(500);
        return;
    }

    // Grab profile data
    var profile = my_clients[proposed_friend_id];

    // Pull together public data
    var public_profile_data = {name:profile['name'], known_languages:profile['known_languages'], unknown_languages:profile['unknown_languages']};

    // Add extra data if friends
    if(areFriends(proposed_friend_id, req.user.id)){
        public_profile_data['screename'] = profile['screename'];
    }

    res.send(public_profile_data);
});

// Settings Updating API

// Submit Friend Request
app.post('/api/request_friend', ensureAuthenticated, function(req, res){
    var id = req.user.id;
    var proposed_friend_id = req.body.friend_id;

    // Acceptable Friend filter
    if(!acceptableFriend(proposed_friend_id)){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }

    // Check if the friend being requested is already a friend
    var requesters_friends = my_clients[id]['friends'];
    if(requesters_friends.indexOf(proposed_friend_id) > -1){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }
    
    // Check if the friend being requested has already been requested
    var requesters_submitted_requests = my_clients[id]['submitted_friend_requests'];
    if(requesters_submitted_requests.indexOf(proposed_friend_id) > -1){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }

    // Add requested friend to requesters list
    my_clients[id]['submitted_friend_requests'].push(proposed_friend_id);

    // Add requester to requesteds list
    my_clients[proposed_friend_id]['friend_requests'].push(id);

    // Send OK
    res.send(200);
});

// Accept Friend Request
app.post('/api/accept_friend', ensureAuthenticated, function (req, res){
    var id = req.user.id;
    var proposed_friend_id = req.body.friend_id;

    // Grab clients friend requests
    var client_friend_rq = my_clients[id]['friend_requests'];

    // Grab index of friend the client is trying to accept
    var index = client_friend_rq.indexOf(proposed_friend_id);

    // Filter out unacceptable friends and bad indexes
    if(!acceptableFriend(proposed_friend_id) || index == -1){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }

    // Remove friend request
    client_friend_rq.splice(index, 1);
    my_clients[id]['friend_requests'] = client_friend_rq;

    // Add to friends
    my_clients[id]['friends'].push(proposed_friend_id);

    // Remove from requesters submitted requests
    var requester_fr = my_clients[proposed_friend_id]['submitted_friend_requests'];
    var index = requester_fr.indexOf(id);
    if(index > -1){
        requester_fr.splice(index, 1);
        my_clients[proposed_friend_id]['submitted_friend_requests'] = requester_fr;
    }

    // Add accepter to requester's friend list
    my_clients[proposed_friend_id]['friends'].push(id);
       
    // Send OK
    res.send(200);

});

// Add Language
app.post('/api/add_lang', ensureAuthenticated, function(req, res){
    var id = req.user.id;

    // Grab langauge
    var proposed_language = req.body.language;
    var proposed_time = req.body.time;
    var proposed_known = req.body.known;

    if(!acceptableLang(proposed_language)){
        res.send(500,{error:"unacceptable language"});
        return;
    }

    if(!acceptableTime(proposed_time)){
        res.send(500,{error:"unacceptable time"});
        return;
    }

    if(!acceptableKnown(proposed_known)){
        res.send(500,{error:"unacceptable known"});
        return;
    }

    // Known Language
    proposed_known = (proposed_known === 'true');
    if(proposed_known){
        var client_known_languages = my_clients[id]['known_languages']; 
        client_known_languages.push({language:proposed_language, time:proposed_time});

        // Merge
        my_clients[id]['known_languages'] = arrayUnique(client_known_languages);
    }else{
        var client_unknown_languages = my_clients[id]['unknown_languages']; 
        client_unknown_languages.push({language:proposed_language, time:proposed_time});

        // Merge
        my_clients[id]['unknown_languages'] = arrayUnique(client_unknown_languages);
    }

    // Send OK
    res.send(200);
});

// Remove Language
app.post('/api/remove_lang', ensureAuthenticated, function(req, res){
    var id = req.user.id;

    // Grab langauge
    var proposed_language = req.body.language;
    if(!acceptableLang(proposed_language)){
        res.send(500,{error:"unacceptable language"});
        return;
    }

    var current = my_clients[id]['languages']; 
    
    // Remove
    var index = -1;
    for(var i = 0; i < current.length; ++i){ 
        if(current[i]['language'] == proposed_language){
            index = i;
            i = current.length;
        }
    }
    if (index > -1) {
        current.splice(index, 1);
        res.send(200);
    }else{
        res.send(500,{error:"language didn't exist"});
    }

});

// Set Skype Username
app.post('/api/set_skype_screename', ensureAuthenticated, function(req, res){
    var id = req.user.id;

    // Grab proposed skype screenname
    var proposed_screename = req.body.screename;
    if(!acceptableScreename(proposed_screename)){
        res.send(500,{error: "Bad Screename"});
        return;
    }

    // Set screenname
    my_clients[id]['screename'] = proposed_screename;
    res.send(200);

});

// Add Friend
app.post('/api/add_friend', ensureAuthenticated, function(req, res){
    var id = req.user.id;

    // Grab Friend 
    var proposed_friend_id = req.body.friend_id;
    if(!acceptableFriend(proposed_friend_id)){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }

    var current = my_clients[id]['friends']; 
    current.push(proposed_friend_id);

    // Merge
    my_clients[id]['friends'] = arrayUnique(current);

    res.send(200);

});

// Remove Friend
app.post('/api/remove_friend', ensureAuthenticated, function(req, res){
    var id = req.user.id;

    // Grab friend_id 
    var proposed_friend_id = req.body.friend_id;
    if(!acceptableFriend(proposed_friend_id)){
        res.send(500,{error:"unacceptable proposed friend"});
        return;
    }

    var client_friends = my_clients[id]['friends']; 
    
    // Remove
    var index = client_friends.indexOf(proposed_friend_id);
    if (index > -1) {
        client_friends.splice(index, 1);
        res.send(200);
    }else{
        res.send(500,{error:"didn't have friend to remove"});
    }

});

app.get('/auth/facebook',
        passport.authenticate('facebook'),
        function(req, res){
            // The request will be redirected to Facebook for authentication, so this
            // function will not be called.
        });

app.get('/auth/facebook/callback', 
        passport.authenticate('facebook', { failureRedirect: '/login' }),
        function(req, res) {
            // Add client id
            if(my_clients[req.user.id] !== undefined){
                console.log("Not new client");
            }else{
                console.log("New Client!");
            }

            my_clients[req.user.id] = {}; 
            my_clients[req.user.id]['id'] = req.user.id; 
            my_clients[req.user.id]['name'] = req.user.displayName;
            my_clients[req.user.id]['known_languages'] = [];
            my_clients[req.user.id]['unknown_languages'] = [];
            my_clients[req.user.id]['submitted_friend_requests'] = [];
            my_clients[req.user.id]['friend_requests'] = [];
            my_clients[req.user.id]['friends'] = [];

            res.redirect('/');
        });

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
});

app.listen(3000);

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login')
}
function arrayUnique(array) {
    var a = array.concat();
    for(var i=0; i<a.length; ++i) {
        for(var j=i+1; j<a.length; ++j) {
            if(a[i][0] === a[j][0])
                a.splice(j--, 1);
        }
    }

    return a;
};
function areFriends(id1, id2){
    return my_clients[id1]['friends'].indexOf(id2) > -1;
}
function acceptableLang(element){
    return element !== '' && element !== undefined;
}
function acceptableTime(element){
    return element !== '' && element !== undefined;
}
function acceptableScreename(name){
    return true;
}
function acceptableFriend(id){
    return my_clients[id] !== undefined;
}
function acceptableKnown(known){
    return true;
}
