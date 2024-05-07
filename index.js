
require("./utils.js");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const port = process.env.PORT || 3001;

const app = express();

const Joi = require("joi");


const expireTime = 1 * 60 * 60 * 1000; //expires after 1 HOUR  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
	crypto: {
		secret: mongodb_session_secret
	}
})

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore, //default is memory store 
	saveUninitialized: false, 
	resave: true
}
));

app.get('/', (req,res) => {
    let html;
  //If logged in, display members and logout
  if (req.session.authenticated) {
    html = `
    Hello, ${getUsername(req)}
    <form action='/members' method='get'>
      <button>Members Page</button>
    </form>
    <form action='/logout' method='get'><button>Logout</button></form>
    `;
  } else {
    // else display links to signup and signin
    html = `
    <form action='/createUser' method='get'>
      <button>Sign up!</button>
    </form>
    <form action='/login' method='get'>
      <button>Log in!</button>
    </form>`;
  }
  res.send(html);
});

app.get('/nosql-injection', async (req,res) => {
	var username = req.query.user;

	if (!username) {
		res.send(`<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`);
		return;
	}
	console.log("user: "+username);

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);

	if (validationResult.error != null) {  
	   console.log(validationResult.error);
	   res.send("<h1 style='color:darkred;'>BAD!! NOSQL ATTACK!</h1>");
	   return;
	}	

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	console.log(result);

    res.send(`<h1>Hello ${username}</h1>`);
});


app.get('/createUser', (req,res) => {
    var html = `
    create user
    <form action='/submitUser' method='post'>
    <input name='username' type='text' placeholder='username'>
    <input name='password' type='password' placeholder='password'>
    <button>Submit</button>
    </form>
    `;
    res.send(html);
});


app.get('/login', (req,res) => {
    var html = `
    log in
    <form action='/loggingin' method='post'>
    <input name='username' type='text' placeholder='username'>
    <input name='password' type='password' placeholder='password'>
    <button>Submit</button>
    </form>
    `;
    res.send(html);
});

app.post('/submitUser', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

	const schema = Joi.object(
		{
			username: Joi.string().alphanum().max(20).required(),
			password: Joi.string().max(20).required()
		});
	
	const validationResult = schema.validate({username, password});
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/createUser");
	   return;
   }

    var hashedPassword = await bcrypt.hash(password, saltRounds);
	
	await userCollection.insertOne({username: username, password: hashedPassword});
	console.log("Inserted user");

    var html = "successfully created user" 
    + "<form action='/' method='get'><button>Return to homepage</button></form>";
    res.send(html);
});

app.post('/loggingin', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/login");
	   return;
	}

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	console.log(result);
	if (result.length != 1) {
		console.log("user not found");
		res.redirect("/login");
		return;
	}
	if (await bcrypt.compare(password, result[0].password)) {
		console.log("correct password");
		req.session.authenticated = true;
		req.session.username = username;
		req.session.cookie.maxAge = expireTime;

		res.redirect('/loggedIn');
		return;
	}
	else {
		console.log("incorrect password");
		res.redirect("/login");
		return;
	}
});

app.get('/loggedin', (req,res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    var html = `
    You are logged in!
    <form action='/' method='get'><button>Return to homepage</button></form>
    <form action='/logout' method='get'><button>Logout</button></form>
    `;
    res.send(html);
});

app.get('/logout', (req,res) => {
	req.session.destroy();
    var html = `
    You are logged out.
    <form action='/' method='get'><button>Return to homepage</button></form>
    `;
    res.send(html);
});


app.get('/members', (req,res) => {

    if (!req.session.authenticated) {
        res.redirect('/');
    }

    var cat = Math.floor(Math.random() * 3);
    switch(cat) {
        case 1:
            res.send("Lucifer:<br/><img src='/lucifer.jpg' style='width:250px;margin-bottom:15px;'>"
            +"<form action='/logout' method='get'><button>Logout</button></form>"
            +"<form action='/' method='get'><button>Return to homepage</button></form>"
            );
          break;
        case 2:
            res.send("Milka:<br/><img src='/milka.jpg' style='width:250px;margin-bottom:15px;'>"
            +"<form action='/logout' method='get'><button>Logout</button></form>"
            +"<form action='/' method='get'><button>Return to homepage</button></form>"
            );
          break;
        default:
            res.send("Shiro:<br/><img src='/shiro.jpg' style='width:250px;margin-bottom:15px;'>"
            +"<form action='/logout' method='get'><button>Logout</button></form>"
            +"<form action='/' method='get'><button>Return to homepage</button></form>"
            );
            break;
      } 
      
});


app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.send("404. grats. you broke it.<br/><form action='/' method='get'><button>Return to homepage</button></form>");
})

app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 

function isLoggedIn(req) {
  return req.session.authenticated;
}

function getUsername(req){
  return req.session.username;
}