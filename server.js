const http = require("http");
const express = require("express");
const WSServer = require("ws").Server;
var favicon = require("serve-favicon");
let server;
const app = express();
app.use(favicon(__dirname + '/client/assets/server.png'));

//Both customers and agents who connected to the server
var users = new Map();
//Agents who are assigned to the customer (ie) agents who are busy
var busy = new Map();
//To display the list of users connected to the server
app.get("/", function (req, res) {
  data = "<h1>Server Started and running successfully</h1><h2>User Logged in list :-</h2>";
  for(const [key,value] of users.entries()) {
  	data += "<h3>"+key+"  -  "+value.isAgent+"</h3>";
  }
  res.send(data);
});
server = new http.createServer(app);
var wss = new WSServer({ server });
//boolean to find if any agent exist or not
var agentexist = false;
//number of agents currently logged in the server
var numberofagents = 0;
//This maintains a count for each customer that number of agents rejected the customer's request
var rejectcount = new Map();

wss.on("connection", function (connection) {
  console.log("One connection is connected");

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
    	//If logged in person is an agent then add it to the list else Round robin algo should be called
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
    	//If an agent clicks the disconnect button he should become available to connect next customer
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
    	//On message send from customer to agent or vice versa
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
    				console.log("Send to is not available and isAgent is true");
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
    	//The response from the agent whether to connect the requested customer or not
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
    				//if rejected count of that customer increases or equals the number of agents then it means all agents rejected
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
    					//if not then call RRalgo again to ask the next agent
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
  	//if customer left send info to agent
  	if(connection.name && connection.isAgent == false) {
  		console.log(connection.name+": This Customer left");
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
  		//if agent left send info to customer
  		numberofagents--;
  		console.log(connection.name+" :This agent left");
  		console.log("Number of agents left "+numberofagents);
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

//function to move available agent from user list to busy list
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

//function to move busy agent from busy list to user list
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

//function which implements Round robin algorithm
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

//sends message to the connection
function sendTo(connection, packet) {
  connection.send(JSON.stringify(packet));
}

server.on("error", (err) => console.log("Server error:", err));
server.listen(process.env.PORT || 9090, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});
