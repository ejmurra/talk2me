var express     = require('express'),
    bodyParser  = require('body-parser'),
    app         = express(),
    http        = require('http'),
    server      = http.createServer(app),
    path        = require('path'),
    passport    = require('passport'),
    util        = require('util'),
    FacebookStrategy = require('passport-facebook').Strategy,
    pg          = require('pg');

// Setup PostgreSQL

var priv = null;
var url = null;
var matchmaking_query;

// Very very tiny tiny change of race condition
fs = require('fs')
fs.readFile('./matchmaking.sql', 'utf8', function (err,data) {
    if (err) {
        return console.log(err);
    }
    matchmaking_query = data;
});

try{
    priv = require('./private.json');
    url = priv['postgresUrl'];
}catch(err){
    console.log("Error finding postgres link");
}

console.log("Url: " + url);

pg.connect(url, function(err, client, done){
    if(err){
        return console.error('could not connect to postgres', err);
    }
    client.query('SELECT NOW() as time', function (err, result){
        done();	// Release Client
        if(err){
            return console.error('error running query', err);
        }
        console.log(result.rows[0].time);
    });
});

var port = 3000;

var FACEBOOK_APP_ID = "756951677690205"
var FACEBOOK_APP_SECRET = "4d350b7d819c72857fc49c8a5018dd9d";

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
        console.log("Tick");
        return done(null, profile['_json']);
    });
}));

app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: '1234567890QWERTY'}));
app.use(express.methodOverride());
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.set('views', 'views/');
app.set('view engine', 'jade');
app.use(express.static(path.resolve('./public')));

app.get('/', function(req, res){
    console.log(req.user);
    var data = {authenticated: req.isAuthenticated()};
    if(data['authenticated']){
        getUserData(req.user.user_id, false, function (data) {
            data['authenticated'] = true;
            getLanguageAndFluencyData(function(response){
                if(response == 500){
                    res.send(response);
                }else{
                    data['language_data'] = response.language_data;
                    data['fluency_data'] = response.fluency_data;
                    console.log(data);
                    res.render('index', data);
                }
            });
        });
    }else{
        res.render('index', data);
    }
});

app.get('/account', ensureAuthenticated, function(req, res){
    // Pull data
    res.render('account', { user: req.user });
});

app.get('/login', function(req, res){
    res.render('login', { user: req.user });
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
            // Client just authenticated. Check if new.
            console.log("callback");
            console.log(req.user);
            pg.connect(url, function(err, client, done){
                if(err){
                    return console.error('could not connect to postgres', err);
                }
                query_str = 'SELECT id FROM \"user\" WHERE fb_id = \'' + req.user.id + '\';';
                console.log(query_str);
                client.query(query_str, function (err, result){
                    done();	// Release Client
                    if(err){
                        return console.error('error running query', err);
                    }
                    if(result.rows.length == 0){
                        // New user. Run Setup.
                        pg.connect(url, function(err, client, done){
                            if(err){
                                return console.error('could not connect to postgres', err);
                            }
                            query_str = 'INSERT INTO \"user\" (fb_id, name) VALUES (\'' + req.user.id + '\', \'' + req.user.name+ '\') RETURNING id;';
                            console.log(query_str);
                            client.query(query_str, function (err, result){
                                done();	// Release Client
                                if(err){
                                    return console.error('error running query', err);
                                }
                                req.user.user_id = result.rows[0].id;
                                res.redirect('/');
                            });
                        });

                    }else{
                        req.user.user_id = result.rows[0].id;
                        res.redirect('/');
                    }
                });
            });
        });

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
});

// Language Data
app.get('/api/get_language_data', function (req, res){
    getLanguageData(function(response){
        res.send(response);
    });
});

// Data Printer
app.get('/api/get_data', ensureAuthenticated, function (req, res){
    getUserData(req.user.user_id, false, function (data){
        res.send(data);
    });
});

// Add Lang
app.post('/api/add_lang', ensureAuthenticated, function (req, res){
    var user_id     = req.user.user_id,
    language    = req.body.language,
    fluency     = req.body.fluency,
    known       = req.body.known;

// TODO: sanitize

// Check existence
pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'SELECT 1 FROM user_to_language WHERE user_id = \'' + user_id  + '\' AND language_id = \'' + language + '\''; 
    console.log(query_str);
    client.query(query_str, function (err, result){
        if(err){
            res.send(500);
            return console.error('error running query', err);
        }
        if(result.rows.length == 0){
            query_str = 'INSERT INTO user_to_language VALUES (' + user_id + ', \'' + language + '\', ' + fluency + ', \'' + known + '\');';
            console.log(query_str);
            client.query(query_str, function (err, result){
                done();
                if(err){
                    res.send(500);
                    return console.error('error running query', err);
                }
                res.send(200);
            });
        }else{
            done();
            res.send(500);
        }
    });
});
});

// Remove Lang
app.post('/api/remove_lang', ensureAuthenticated, function (req, res){
    var user_id     = req.user.user_id,
    language    = req.body.language;

// TODO: sanitize

// Check existence
pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'SELECT 1 FROM user_to_language WHERE user_id = \'' + user_id  + '\' AND language_id = \'' + language + '\''; 
    console.log(query_str);
    client.query(query_str, function (err, result){
        if(err){
            res.send(500);
            return console.error('error running query', err);
        }
        if(result.rows.length == 1){
            query_str = 'DELETE FROM user_to_language WHERE language_id = \'' + language + '\';';
            console.log(query_str);
            client.query(query_str, function (err, result){
                done();
                if(err){
                    res.send(500);
                    return console.error('error running query', err);
                }
                res.send(200);
            });
        }else{
            done();
            res.send(500);
        }
    });
});
});

// Set Skype Username
app.post('/api/set_skype_screename', ensureAuthenticated, function (req, res){
    console.log(req.user);
    var user_id = req.user.user_id,
    screename = req.body.screename;
// TODO : Sanitize

pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'UPDATE "user" SET screename = \'' + screename + '\' WHERE id = ' + user_id + ';';
    console.log(query_str);
    client.query(query_str, function (err, result){
        done();
        if(err){
            res.send(500);
            return console.error('error running query', err);
        }
        res.send(200);
    });
});

});
/*
 * status codes:
 * 0 - user_id requested peer_id
 * 1 - user_id friends with peer_id
 */
// Add Friend
app.post('/api/add_friend', ensureAuthenticated, function(req, res){
    var user_id = req.user.user_id,
    peer_id= req.body.peer_id;

pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'SELECT 1 FROM user_relationships WHERE user_id = \'' + user_id + '\' AND peer_id = \'' + peer_id + '\';';
    console.log(query_str);
    client.query(query_str, function (err, result){
        if(err || result.rows.length > 0){
            res.send(500);
            return console.error('error running query', err);
        }
        query_str = 'INSERT INTO user_relationships VALUES(' + user_id + ', ' + peer_id + ',0)'; 
        client.query(query_str, function (err, result){
            done();
            if(err || result.rows.length > 0){
                res.send(500);
                return console.error('error running query', err);
            }
            res.send(200);
        });
    });
});
});

// Accept Friend Request
app.post('/api/accept_request', ensureAuthenticated, function (req, res){
    var user_id = req.user.user_id,
    peer_id = req.body.peer_id;

pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'UPDATE user_relationships SET status = 1 WHERE user_id = ' + peer_id + ' AND peer_id = ' + user_id + ';';
    console.log(query_str);
    client.query(query_str, function (err, result){
        if(err){
            res.send(500);
            return console.error('error running query', err);
        }
        res.send(200);
    });
});

});

// Remove relationship 
app.post('/api/remove_relationship', ensureAuthenticated, function(req, res){
    var user_id = req.user.user_id,
    peer_id = req.body.peer_id;

pg.connect(url, function(err, client, done){
    if(err){
        res.send(500);
        return console.error('could not connect to postgres', err);
    }
    query_str = 'DELETE FROM user_relationships WHERE (user_id = \'' + user_id + '\' AND peer_id = \'' + peer_id + '\') OR (user_id = \'' + peer_id + '\' AND peer_id = \'' + user_id + '\');';
    console.log(query_str);
    client.query(query_str, function (err, result){
        if(err){
            res.send(500);
            return console.error('error running query', err);
        }
        res.send(200);
    });
});
});

// View Public Profile
app.get('/profile', ensureAuthenticated, function(req, res){
    var peer_id = req.query.peer_id;
    var restricted = friendshipCheck(req.user.user_id, peer_id);
    getUserData(peer_id, restricted, function (data){
        res.send(data);
    });
});

// Friend Suggestions
app.get('/api/friend_suggestions', ensureAuthenticated, function(req, res){
    pg.connect(url, function(err, client, done){
        if(err){
            return console.error('could not connect to postgres', err);
        }
        var user_id = req.user.user_id; // Sanitize
        client.query(matchmaking_query, [user_id], function (err, result){
            if(err){
                return console.error('error running query', err);
            }
            //return result.rows.length > 0;
            res.send(result.rows);
        });
    });

});

function friendshipCheck(uid1, uid2){
    pg.connect(url, function(err, client, done){
        if(err){
            return console.error('could not connect to postgres', err);
        }
        query_str = 'SELECT 1 FROM user_relationships WHERE ((user_id = ' + uid1 + ' AND peer_id = ' + uid2 + ') OR (user_id = ' + uid2 + ' AND peer_id = ' + uid1 + ') AND status = 1);';
        console.log(query_str);
        client.query(query_str, function (err, result){
            if(err){
                return console.error('error running query', err);
            }
            return result.rows.length > 0;
        });
    });
}

function getUserData(uid, restricted, callback){
    var data = {};
    pg.connect(url, function(err, client, done){
        if(err){
            return console.error('could not connect to postgres', err);
        }
        query_str = 'SELECT id, name, screename FROM "user" WHERE id = \'' + uid + '\';';
        console.log(query_str);
        client.query(query_str, function (err, result){
            if(err){
                return console.error('error running query', err);
            }
            if(result.rows.length == 0){
                callback({});
                return;
            }
            data['id'] = result.rows[0].id;
            data['name'] = result.rows[0].name;
            if(!restricted){
                data['screename'] = result.rows[0].screename;
            }
            console.log(data);

            query_str = 'SELECT language.name as language_name, language.id as language_id, fluency.name as fluency_name, fluency.id as fluency_id, known FROM user_to_language JOIN language ON (language_id=language.id) JOIN fluency ON (fluency_id=fluency.id) WHERE user_id = \'' + data['id'] + '\'';
            console.log(query_str);
            client.query(query_str, function (err, result){
                if(err){
                    return console.error('error running query', err);
                }
                var arr_k = [], arr_u = [];
                data['languages'] = result.rows;
                for(var i = 0; i < data.languages.length; ++i){
                    var lang_name = data.languages[i]['language_name'];
                    if(data.languages[i]['known']){
                        arr_k.push(lang_name);
                    }else{
                        arr_u.push(lang_name);
                    }
                }
                data['known_langs'] = arr_k.join(', ');
                data['unknown_langs'] = arr_u.join(', ');

                query_str = 'SELECT user_id, peer_id, status FROM user_relationships WHERE (user_id = \'' + data['id'] + '\' OR peer_id = \'' + data['id']+ '\')';
                    if(restricted){
                        query_str += 'AND status = 1;';
                    }
                    console.log(query_str);
                    client.query(query_str, function (err, result){
                        done();	// Release Client
                        if(err){
                            return console.error('error running query', err);
                        }
                        data['relationships'] = result.rows;
                        callback(data);
                    });
                    });
        });
    });
}

function getLanguageAndFluencyData(callback){
    pg.connect(url, function(err, client, done){
        if(err){
            callback(500);
            return console.error('could not connect to postgres', err);
        }
        response_data = {};
        query_str = 'SELECT * FROM language';
        client.query(query_str, function (err, result){
            if(err){
                callback(500);
                return console.error('error running query', err);
            }
            response_data['language_data'] = result.rows;
            query_str = 'SELECT * FROM fluency';
            client.query(query_str, function (err, result){
                done();
                if(err){
                    callback(500);
                    return console.error('error running query', err);
                }
                response_data['fluency_data'] = result.rows;
                callback(response_data);
            });
        });
    });
}

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login')
}


// listen
server.listen(port);
