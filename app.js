
var settings = require('./settings');

/**
 * Module dependencies.
 */

var express = require('express')
  , _ = require('underscore')
  , http = require('http')
  , jade_browser = require('jade-browser')
  , path = require('path')
  , fs = require('fs')
  , passport = require('passport')
  , FacebookStrategy = require('passport-facebook').Strategy
  , argv = require("optimist").argv
  , MongoStore = require('connect-mongo')(express)
  , fb = require('fb')
  , async = require('async')
  , gm = require('gm')
  , im = require('imagemagick')
  , md5 = require('MD5')
  , racker = require('racker')
  , twilio = require('twilio')(settings.twilio_sid, settings.twilio_secret);
moment = require('moment');
cdn_url = 'http://e7026f8f16c0bcf6d100-23fa34ac10b738921d65a145768427b6.r66.cf1.rackcdn.com';

var db_path = "mongodb://127.0.0.1:27017/wakeup";

//create path if not exist
if(!fs.existsSync("./public/files/")){
	fs.mkdirSync("./public/files");
}

//DB
mongoose = require('mongoose');
db = mongoose.createConnection(db_path);

User = require('./lib/User');    
Pic = require('./lib/Pic');    
Reserve = require('./lib/Reserve');    

//
require('./timers/feature');

var sessionStore = new MongoStore({url:db_path}); 

var reserved = {
	"following":1,
	"followers":1,
	"featured":1,
	"popular":1,
	"edit":1,
	"i":1,
	"about":1,
	"latest":1,
	"user":1,
	"logout":1,
	"register":1,
	"auth":1,
	"pic":1,
	"post":1,
	"posts":1,
	"favorites":1,
	"random":1,
	"contact":1,
	"support":1,
	"admin":1,
	"administrator":1,
	"moderator":1
};
 
passport.use(new FacebookStrategy({
		clientID: settings.clientID,
		clientSecret: settings.clientSecret,
		callbackURL: settings.callbackURL
	},
	function(accessToken, refreshToken, profile, done) {
		User.findOne({fbid:profile.id}, function(err, user){
			if(!user){
				new User({
					fbid:profile.id
				  , username: profile.username
				  , date:new Date()
				  , displayName: profile.displayName
				  , raw : profile._raw
				  , accessToken: accessToken
				  , refreshToken: refreshToken
				})
				.save(function(err, user){
					if(err) throw err;
					done(null, user);

				});
			}else{
				// update user
				user.username =  profile.username;
				user.displayName = profile.displayName;
				user.raw = profile._raw;
				user.accessToken = accessToken;
				user.refreshToken = refreshToken;
				user.save(function(err, user){
					if(err) throw err;
					done(null, user);
				});
			}
		});
	}
));

function ScreenNameExists(name, fn){
	User.findOne({screen_name:name},{_id:1}, function(err, exists){
		if(err) throw err;
		if(exists != null){
			return fn(true);
		}
		//check reserve list
		Reserve.count({name:name}, function(err, count){
			if(err) throw err;
			fn(count != 0)
		});
	});
};
function validName(name){
	return name.match(/^[A-z]+$/) != null;
}
function Authenticate(req,res,next){
  if (req.isAuthenticated()) { return next(); }
 	 return res.redirect('/');
}
function Authenticate_admin(req,res,next){
  if (req.isAuthenticated() && req.user.type=='administrator') { return next(); }
 	 return res.redirect('/');
}

passport.serializeUser(function(user, done) {
  done(null, user.fbid);
});

passport.deserializeUser(function(id, done) {
  User.findOne({fbid:id}, function(err, user){
  	done(err, user);
  });
});

var app = express();

app.configure(function(){
	app.set('port', argv.p || 3050);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.compress());
	app.use(require('stylus').middleware(__dirname + '/public'));
	app.use(express.static(path.join(__dirname, 'public')));
	app.use(express.logger('dev'));
	app.use(express.cookieParser("a"));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(jade_browser('/templates.js', '**', {root: __dirname + '/views/components', cache:false}));	
	app.use(express.session({ secret: "a", store: sessionStore, cookie: { maxAge: 1000 * 60 * 60 * 7 * 1000 ,httpOnly: false, secure: false}}));
	app.use(passport.initialize());
	app.use(passport.session());
	app.use(function(req, res, next){
	  	res.locals._user = req.user;
	  	res.header('Vary', 'Accept');
  		next();
	});	
	app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler());
});
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});

app.get('/register', Authenticate, function(req,res){
	if(req.user.screen_name){
		return res.redirect('/');
	}
	res.render('register', {username:req.user.username});
});
app.post('/register',  function(req, res){
	console.log(req.body);
	var data = JSON.parse(req.body.data);
	console.log(data);
	var screen_name = data.screen_name;
	//check if reserved
	if(screen_name in reserved){
		return res.json({error:"Invalid username!"});	
	}
	//check validity
	if(!validName){
		return res.json({error:"Invalid username!"});
	}
	ScreenNameExists(screen_name, function(exists){
		if(exists){
			return res.json({error:'Already registered'});
		}
		User.update({_id:req.user._id}, {$set:data}, function(err, user){
			if(err) throw err;
			User.findOne({_id:req.user._id}, function(err, user){
				if(err) throw err;
				return res.json({message:'Registered, you will receive an SMS shortly.'});
			});
			//send sms
			var phone = data.phone;
			twilio.sendSms({

				to:'+960' + phone, 
				from: '+14695072406', 
				body: 'Thankyou for registering in WakeUpMV.' 

			}, function(err, responseData) { 

				if (err) { 
					throw err;
				}
			});
		});
	});
});

app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['publish_stream', 'publish_actions'] }));
app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { successRedirect: '/',
                                      failureRedirect: '/login' }));

app.get('*', function(req, res, next){
	//show signup page if user is not registered after authentication
	if(typeof req.user == 'undefined'){
		return next();
	}

	if(!req.user.screen_name){
		res.redirect('/register');
	}else{
		return next();
	}
});
app.get('/', function(req,res){
	res.render("login",{registered:req.isAuthenticated()});
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});





