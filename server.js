const http = require("http");
const express = require("express");
const WSServer = require("ws").Server;
var favicon = require("serve-favicon");
let server;
const app = express();
app.use(favicon(__dirname + '/client/assets/server.png'));
//all connected to the server users
var users = new Map();
var busy = new Map();
app.get("/", function (req, res) {
  data = "<h1>Server Started and running successfully</h1><h2>User Logged in list :-</h2>";
  // for(const usr in users){
  //   data += "<h3>"+usr+"</h3>";
  // }
  // res.send(data);
  //res.sendFile(__dirname + "/client/index.html");
});
server = new http.createServer(app);
var wss = new WSServer({ server });
var agentexist = false;
var numberofagents = 0;
var rejectcount = new Map();

wss.on("connection", function (connection) {
  console.log("User connected and size of userslist is "+users.size+" and size of busylist is " +busy.size);
  connection.on("message",function(packet){
	var data;
	try {
      data = JSON.parse(packet);
      console.log(data);
    } catch (e) {
      console.log("Invalid JSON");
      data = {};
    }


    switch(data.type) {
    	case "login": {
    		if(data.name != null && users.has(data.name)){
    			console.log(data.name+": Already Exist...Try different name !");
    		} else {
    			console.log("User logged in "+data.name+" as "+data.isAgent);
    			connection.type = null;
    			connection.isAgent = data.isAgent;
    			connection.name = data.name;
    			connection.to = null;
    			connection.message = null;
    			users.set(data.name,connection);
    			if(data.isAgent == false){
    				agentexist = false;
    				rejectcount.set(data.name,0);
    				console.log("RRalgo called");
    				RRalgo(data.name,connection);
    			} else {
    				numberofagents++;
    				console.log("Number of agents "+numberofagents);
    			}
    		}
    		break;
    	}
    	case "leave": {
    		if(data.isAgent == true && data.name != null) {
    			console.log(data.name+ "is disconnecting from "+data.to);
    			connection.to = null;
    			movefrombusytoavailable(data.name);
    			let packet = {
    				type:"leave",
    				isAgent: data.isAgent,
    				name:data.name,
    				to:null,
    				message:null
    			}
    			sendTo(connection,packet);
  				if(users.has(data.to)) {
  					var conn = users.get(data.to);
  					conn.to = null;
  					let packet = {
						type:"leave",
						isAgent:conn.isAgent,
						name:conn.name,
						to:null,
						message:null
					};
  					sendTo(conn,packet);
  				}
    		} else {
    			console.log("case leave is not called by agent");
    		}
    		break;
    	}
    	case "message": {
    		if(data.isAgent == true) {
    			console.log("Message sent from agent to user");
    			if(data.to != null && users.has(data.to)){
    				let conn = users.get(data.to);
    				if(data.to == conn.name) {
    					console.log("Message sent from "+data.name+" to "+conn.name);
    					sendTo(conn,data);
    				} else {
    					console.log("The user is connected with someone");
    				}
    			} else {
    				console.log("Send to is not available else and isAgent is true");
    			}
    		} else if(data.isAgent == false) {
    			console.log("Message sent from user to agent");
    			if(data.to != null && busy.has(data.to)) {
    				let conn = busy.get(data.to);
    				if(data.to == conn.name) {
    					if(data.to == conn.name) {
    						console.log("Message sent from "+data.name+" to "+conn.name);
    						sendTo(conn,data);
    					} else {
    						console.log("The Agent is connected with someone else");
    					}
    				}
    			} else {
    				console.log("Send to is not available and isAgent is false");
    			}
    		}
    		break;
    	}
    	case "askresponse": {
    		if(data.isAgent == true && data.message != null && data.message == "yes") {
    			let conn = users.get(data.to);
    				movefromavailabletobusy(data.name);
    				conn.to = data.name;
    				connection.to = data.to;
    				let Agentpacket = {
    					type:"connected",
    					isAgent: connection.isAgent,
    					name:connection.name,
    					to:connection.to,
    					message:null
    				}
    				sendTo(connection,Agentpacket);
    				let Userpacket = {
	    				type:"connected",
    					isAgent: conn.isAgent,
    					name:conn.name,
    					to:conn.to,
    					message:null
    				}
    				sendTo(conn,Userpacket);
    		} else if(data.message != null && data.message == "no"){
    			console.log("Agent rejected the request call for next agent");
    			let conn = users.get(data.to);
    			if(rejectcount.has(conn.name)) {
    				var count = rejectcount.get(conn.name);
    				count++;
    				rejectcount.set(conn.name,count);
    				if(count >= numberofagents) {
    					let packet = {
							type:"busy",
							isAgent:conn.isAgent,
							name:conn.name,
							to:null,
							message:null
						};
						sendTo(conn,packet);
    				} else {
    					RRalgo(conn.name,conn);
    				}
    			} else {
    				console.log("No count exist");
    			}
    		}
    		break;
    	}
    	default: {
    		console.log("No such command exist");
    		break;
    	}
    }

  });
  connection.on("close",function() {
  	if(connection.name && connection.isAgent == false) {
  		if(connection.to) {
  			console.log(connection.name+" is disconnecting from "+connection.to);
  			if(busy.has(connection.to)) {
  				var conn = busy.get(connection.to);
  				conn.to = null;
  				movefrombusytoavailable(conn.name);
  				let packet = {
					type:"leave",
					isAgent:conn.isAgent,
					name:conn.name,
					to:connection.name,
					message:null
				};
  				sendTo(conn,packet);
  			}
  		}
  		users.delete(connection.name);
  	} else if(connection.name && connection.isAgent == true) {
  		numberofagents--;
  		if(connection.to) {
  			console.log(connection.name+" is disconnecting from "+connection.to);
  			if(users.has(connection.to)) {
  				var conn = users.get(connection.to);
  				conn.to = null;
  				let packet = {
					type:"leave",
					isAgent:conn.isAgent,
					name:conn.name,
					to:connection.name,
					message:null
				};
  				sendTo(conn,packet);
  			}
  		}
  		if(busy.has(connection.name)) {
  			busy.delete(connection.name);
  		}
  		if(users.has(connection.name)) {
  			users.delete(connection.name);
  		}
  	} 
  });
});


function movefromavailabletobusy(agentname) {
	if(!busy.has(agentname) && users.has(agentname)) {
		let conn = users.get(agentname);
		users.delete(agentname);
		busy.set(agentname,conn);
		console.log("Move successful from available to busy "+agentname);
	} else {
		console.log("Move unsuccessful from available to busy");
	}
}

function movefrombusytoavailable(agentname) {
	if(busy.has(agentname) && !users.has(agentname)) {
		let conn = busy.get(agentname);
		busy.delete(agentname);
		users.set(agentname,conn);
		console.log("Move successful from busy to available "+agentname);
	} else {
		console.log("Move unsuccessful from busy to available");
	}
}

function RRalgo(username,connection) {
	for(const [key,value] of users.entries()) {
		let agentname = key;
		let conn = value;
		if(conn.isAgent == true) {
			agentexist = true;
			let packet = {
				type:"ask",
				isAgent:conn.isAgent,
				name:agentname,
				to:username,
				message:null
			};
			sendTo(conn,packet);
			users.delete(agentname);
			users.set(agentname,conn);
			break;
		}
	}
	if(!agentexist) {
		let packet = {
			type:"noagent",
			isAgent:connection.isAgent,
			name:username,
			to:null,
			message:null
		};
		sendTo(connection,packet);
	}
}

function sendTo(connection, packet) {
  connection.send(JSON.stringify(packet));
}

server.on("error", (err) => console.log("Server error:", err));
server.listen(process.env.PORT || 9090, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
