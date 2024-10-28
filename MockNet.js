global.appType = "MockNet";
global.version = "1.0.0";

const fs = require('fs');
const express = require('express');
const prompt = require("prompt-sync")();
const { execSync } = require("child_process");
const Logger = require('./includes/Logger');

Logger.log();
Logger.log(fs.readFileSync('AppLogo.txt', 'utf8').replace('[version]', 'MockNet v' + version));
Logger.log();

let hostsFilePath = '/etc/hosts';
let backupFilePath = 'hosts.bak';
let mocknetStatusFile = 'mocknet.status.json';
let mocknetStatus = {
	"mocking" : false
};
let mockDefFilePath = 'mock.def.json';
let mockDefinitionData;

let localMockDefFilePath;
let folderPath;
if (process.argv.indexOf("-folderPath") != -1){
	folderPath = process.argv[process.argv.indexOf("-folderPath") + 1];
	localMockDefFilePath = folderPath + "/" + mockDefFilePath;
}

// TODO Check for mock.def.json file in current folder first, and use that if exists
if (fs.existsSync(localMockDefFilePath)){
	Logger.log("Using local mock.def.json config");
	mockDefFilePath = localMockDefFilePath;
}
else if (!fs.existsSync(mockDefFilePath)){
	Logger.log("** No mock.def.json file present - please create one **");
	Logger.log("Defaulting to root example.mock.def.json for demonstration purposes");
	mockDefFilePath = 'example.mock.def.json';
}
else {
	Logger.log("Using root mock.def.json config");
}
try {
	mockDefinitionData = JSON.parse(fs.readFileSync(mockDefFilePath, 'utf-8'));
}
catch (error){
	Logger.log("Error whilst parsing mock definition file. Aborting");
	process.exit(0);
}

if (!fs.existsSync(hostsFilePath)){
	Logger.log("Cannot find hosts file. Exiting.");
	process.exit(0);
}

function loadMocknetStatus(){
	if (fs.existsSync(mocknetStatusFile)){
		try {
			mocknetStatus = JSON.parse(fs.readFileSync(mocknetStatusFile, 'utf-8'));
		}
		catch (error){
			Logger.log("Error whilst loading MockNet status. Exiting.");
			process.exit(0);
		}
	}
}

loadMocknetStatus();

if (process.argv.indexOf("-stop") != -1){
	if (!mocknetStatus.mocking){
		Logger.log("Mocking not currently active.");
	}
	else {
		Logger.log("Stopping mock servers and resetting hosts file.");
		disableMocking();
	}
	process.exit(0);
}

if (mocknetStatus.mocking){
	if (!fs.existsSync(backupFilePath)){
		Logger.log("Missing backup hosts file, but mocking is active. Aborting.");
	}

	showMockStatus();

	let disableMockingChoice = prompt("Disable mocking (y/n)?: ");
	if (disableMockingChoice != null && disableMockingChoice.toLowerCase().trim() == ("y")){
		disableMocking();
	}
}
else {
	if (fs.existsSync(backupFilePath)){
		Logger.log("Mocking is not active, yet backup file exists. Aborting");
		process.exit(0);
	}

	Logger.log("\nPlease choose mock set to apply\n");

	let mockNameArray = Object.keys(mockDefinitionData);
	for (let index = 0; index < mockNameArray.length; index++){
		Logger.log("\t" + (index + 1) + ". " + mockNameArray[index]);
	}

	Logger.log();
	let mockChoiceIndex = prompt(mockNameArray.length > 1 ? 'Choose (1-' + mockNameArray.length + '): ' : 'Choose: ');
	if (mockChoiceIndex == null || mockChoiceIndex == ''){
		process.exit(0);
	}
	mockChoiceIndex = parseInt(mockChoiceIndex.trim());
	if (Number.isNaN(mockChoiceIndex) || mockChoiceIndex < 1 || mockChoiceIndex > mockNameArray.length){
		Logger.log("Invalid choice.");
		process.exit(0);
	}
	let mockChoiceKey = mockNameArray[mockChoiceIndex - 1];

	let mockSet = mockDefinitionData[mockChoiceKey];
	let mockSetRedirects = mockSet.redirects;

	let hostsFileContent = fs.readFileSync(hostsFilePath, 'utf-8');

	// backup the hosts file
	Logger.log("\n💾 Backing up hosts file\n");
	fs.writeFileSync(backupFilePath, hostsFileContent);

	Logger.log("About to update your " + hostsFilePath + "file. You may be asked for your password.\n");

	// change hosts ownership
	execSync('sudo chown $(whoami) ' + hostsFilePath);

	// apply the redirects
	for (let index = 0; index < mockSetRedirects.length; index++){
		let mockSetRedirect = mockSetRedirects[index];
		Logger.log("\t" + mockSetRedirect.source + " 👉 " + mockSetRedirect.target);
		hostsFileContent += "\n" + mockSetRedirect.target + "\t" + mockSetRedirect.source;
	}
	Logger.log("\n💾 Updating hosts file with mocking applied\n");
	fs.writeFileSync(hostsFilePath, hostsFileContent);

	// reset hosts ownership
	execSync('sudo chown root ' + hostsFilePath);

	// update the Mocknet status file
	mocknetStatus.mocking = true;
	mocknetStatus.name = mockChoiceKey;
	saveMockNetStatus();

	if (mockSet.servers){
		for (let serverIndex = 0; serverIndex < mockSet.servers.length; serverIndex++){
			let serverEntry = mockSet.servers[serverIndex];
			startServer(serverEntry.port, serverEntry.server);
		}
		Logger.log();
	}

	Logger.log("🟢 Mocking: ON\n");
}

function startServer(port, server){
	Logger.log("🌐 Starting mock server on port: " + port);
	let serverConfigPath = "tmp." + Math.random() * 100000 + ".config.json";
	fs.writeFileSync(serverConfigPath, JSON.stringify(server));
	let startServerString = '#!/bin/bash\n\nnohup node MockNetServer.js -port ' + port + ' -serverConfigPath "' + serverConfigPath + '" &';
	fs.writeFileSync('startServer.sh', startServerString);
	var spawn = require('child_process').spawn;
	spawn('bash', ['startServer.sh'], {
	    stdio: 'ignore',
	    detached: true
	}).unref();
}

function showMockStatus(){
	if (!mocknetStatus.name){
		Logger.log("\n🟡 Mocking: ON\n");
		Logger.log("No mock name found, cannot display mock status\n");
	}
	else {
		Logger.log("\n🟢 Mocking: ON\n");
		Logger.log("Active mock set: " + mocknetStatus.name + "\n");

		let mockSet = mockDefinitionData[mocknetStatus.name];
		let mockSetRedirects = mockSet.redirects;

		for (let index = 0; index < mockSetRedirects.length; index++){
			let mockSetRedirect = mockSetRedirects[index];
			Logger.log("\t" + mockSetRedirect.source + " 👉 " + mockSetRedirect.target);
		}
		Logger.log();
	}
}

function disableMocking(){
	Logger.log("\nAbout to reset your " + hostsFilePath + "file. You may be asked for your password.\n");

	let backupFileContent = fs.readFileSync(backupFilePath, 'utf-8');
	execSync('sudo chown $(whoami) ' + hostsFilePath);
	fs.writeFileSync(hostsFilePath, backupFileContent);
	execSync('sudo chown root ' + hostsFilePath);
	fs.unlinkSync(backupFilePath);
	mocknetStatus.mocking = false;
	saveMockNetStatus();
	execSync('pkill -f MockNetServer.js');
	Logger.log("🛑 Mocking: OFF\n");
}

function saveMockNetStatus(){
	try {
		fs.writeFileSync(mocknetStatusFile, JSON.stringify(mocknetStatus));
		Logger.log("💾 Updating MockNet status file\n");
	}
	catch (error){
		Logger.log("Error whilst trying to save MockNet status file.");
	}
}