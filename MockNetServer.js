global.appType = "MockNetServer";
global.version = "1.0.0";
global.port = 0;

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const PropertiesReader = require('properties-reader');
const https = require('https');
const app = express();
const Logger = require('./includes/Logger');

const defaultPort = 3000;

Logger.log();
Logger.log(fs.readFileSync('ServerAppLogo.txt', 'utf8').replace('[version]', 'MockNetServer v' + version));
Logger.log();

/**
 * Objects and Variables
 */

// command line params
let configPath;
if (process.argv.indexOf("-configPath") != -1){
	configPath = process.argv[process.argv.indexOf("-configPath") + 1];
	if (!configPath){
		Logger.log("Defaulting to local config");
		configPath = 'mocknetserver.config.ini';
	}
}
else {
	Logger.log("Defaulting to local config");
	configPath = 'mocknetserver.config.ini';
}
if (process.argv.indexOf("-port") != -1){
	port = process.argv[process.argv.indexOf("-port") + 1];
	if (!port){
		Logger.log("Defaulting to port " + defaultPort);
		port = defaultPort;
	}
}
else {
	Logger.log("Defaulting to port " + defaultPort);
	port = defaultPort;
}

// properties
let properties = PropertiesReader(configPath);
global.debugMode = properties.get('main.debug.mode');
let privateKey, certificate, credentials = null;
let selfSignedAllowed = false;
if (properties.get('ssl.private.key') && properties.get('ssl.certificate')){
	privateKey = fs.readFileSync(properties.get('ssl.private.key'), 'utf8');
	certificate = fs.readFileSync(properties.get('ssl.certificate'), 'utf8');
	credentials = {
		key: privateKey,
		cert: certificate
	};
	if (properties.get('ssl.allow.self.signed')){
		selfSignedAllowed = true;
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}
}
let allowedOrigins = null;
if (properties.get('cors.allowed.origins')){
	allowedOrigins = properties.get('main.allowed.origin.file').split(',');
};
let homepageText = properties.get('page.home.text') + version;

let serverConfigPath;
if (process.argv.indexOf("-serverConfigPath") != -1){
	serverConfigPath = process.argv[process.argv.indexOf("-serverConfigPath") + 1];
	if (!serverConfigPath){
		Logger.log("No serverConfigPath provided. Default to example.config.json file.");
		serverConfigPath = 'example.config.json';
	}
}
else {
	Logger.log("No serverConfigPath provided. Default to example.config.json file.");
	serverConfigPath = 'example.config.json';
}
try {
	serverConfig = JSON.parse(fs.readFileSync(serverConfigPath, 'utf-8'));
	if (serverConfigPath.startsWith('tmp')){
		Logger.log("Removing temp config file");
		fs.unlinkSync(serverConfigPath);
	}
}
catch (error){
	Logger.log("Unable to parse serverConfig. Aborting.");
	process.exit(0);
}

const GET = "GET";
const POST = "POST";


/**
 * Config
 */

// allow CORS for specific situations
app.use(function (req, res, next) {
	let origin = req.headers.origin;
	if (allowedOrigins && allowedOrigins.indexOf(origin) > -1){
		res.setHeader('Access-Control-Allow-Origin', origin);
	}
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.header('Access-Control-Allow-Credentials', true);
	next();
});

// for processing POST parameters
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(bodyParser.json());


/**
 * API Endpoints
 */

app.get('*', function (req, res) {
	let specificResponse = getSpecificResponse(req, GET);
	res.status(specificResponse.code).send(specificResponse.body);
});

app.post('*', function (req, res) {
	if (overflowDetected(req, res)){
		return;
	}
	let specificResponse = getSpecificResponse(req, POST);
	res.status(specificResponse.code).send(specificResponse.body);
});


/**
 * Functions
 */

function getSpecificResponse(req, method){
	let host = getHost(req);
	let hostConfig = serverConfig[host];
	if (!hostConfig){
		if (serverConfig["*"]){
			hostConfig = serverConfig["*"];
		}
		else {
			if (debugMode) {
				Logger.log("[Debug] [" + method + "] Config missing for host: " + host);
			}
			return {
				"body" : "Config missing for host: " + host,
				"code" : 500
			};
		}
	}

	let specificServerConfig = hostConfig[method];
	if (!specificServerConfig){
		if (debugMode) {
			Logger.log("[Debug] [" + method + "] Request method config missing for host: " + host);
		}
		return {
			"body" : "Config missing for request method: " + method,
			"code" : 500
		};
	}

	let path = req.path;
	let specificResponse = specificServerConfig[path];
	if (!specificResponse){
		let defaultResponse = specificServerConfig.default;
		if (defaultResponse){
			if (debugMode) {
				Logger.log("[Debug] [" + method + "] Returning provided default response for: " + host + ":" + global.port + path);
			}
			return defaultResponse;
		}
		if (debugMode) {
			Logger.log("[Debug] [" + method + "] Returning hard-coded default response for: " + host + ":" + global.port + path);
		}
		return {
			"body" : "Path not found",
			"code" : 404
		};
	}

	if (specificResponse.input){
		let processedInputParams = getProcessedInputParams(req, method);
		let inputsArray = specificResponse.input;
		for (let index = 0; index < inputsArray.length; index++){
			let input = inputsArray[index];
			let expectedInputs = input.expected;

			let inputValid = true;

			let expectedInputKeys = Object.keys(expectedInputs);
			for (let inputIndex = 0; inputIndex < expectedInputKeys.length; inputIndex++){
				let expectedInputKey = expectedInputKeys[inputIndex];

				let actualInputValue = processedInputParams[expectedInputKey];
				if (!actualInputValue || actualInputValue != expectedInputs[expectedInputKey]){
					inputValid = false;
					break;
				}
			}
			if (inputValid){
				return input.response;
			}
		}
		// if we reach here, then no valid set of parameters was previously found, so we send default response
		if (debugMode) {
			Logger.log("[Debug] [" + method + "] Returning default response due to invalid input for: " + host + ":" + global.port + path);
		}
		if (specificResponse.default){
			return specificResponse.default;
		}
		else if (specificServerConfig.default){
			return specificServerConfig.default;
		}
		return {
			"body" : "Invalid input values for: " + host + ":" + global.port + path,
			"code" : 400
		};
	}

	if (debugMode) {
		Logger.log("[Debug] [" + method + "] Returning specific response for: " + host + ":" + global.port + path);
	}

	return specificResponse;
}

function getHost(req){
	let host = req.get('host');
	if (host.includes(":")){
		host = host.substr(0, host.indexOf(":"));
	}
	return host;
}

function getProcessedInputParams(req, method){
	if (method == POST){
		// TODO Need to handle raw JSON input also
		return req.body;
	}
	else if (method == GET){
		return req.query;
	}
	return {};
}

function overflowDetected(req, res){
	if (req.body && JSON.stringify(req.body).length > 1e6) {
		res.status(413).send("PAYLOAD TOO LARGE");
		req.connection.destroy();
		return true;
	}
	return false;
}


/**
 * Start Server
 */

if (credentials != null){
	let httpsServer = https.createServer(credentials, app);
	module.exports = httpsServer.listen(port);
	Logger.log('HTTPS Listening on port ' + port + '...');
	if (selfSignedAllowed){
		Logger.log("WARNING: Self-signed certificates allowed");
	}
}
else {
	module.exports = app.listen(port);
	Logger.log('HTTP Listening on port ' + port + '...');
}
Logger.log();