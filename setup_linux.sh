#!/bin/bash

touch ~/.bashrc

MOCKNETSET=false
MOCKNETSTOPSET=false

while read -r line
do
	if [[ "$line" =~ ^"alias mocknet="* ]]; then
		MOCKNETSET=true
	fi
done < ~/.bashrc

while read -r line
do
	if [[ "$line" =~ ^"alias mocknetstop="* ]]; then
		MOCKNETSTOPSET=true
	fi
done < ~/.bashrc

NEWLINESET=false

if [[ "$MOCKNETSET" != true ]]; then
	if [[ "$NEWLINESET" != true ]]; then
		echo '' >> ~/.bashrc
		NEWLINESET=true
	fi
	echo "Setting 'mocknet' alias";
	echo "alias mocknet='dt=\$(pwd); cd $(pwd); node --no-warnings MockNet.js -folderPath \$dt; cd \$dt;'" >> ~/.bashrc
fi

if [[ "$MOCKNETSTOPSET" != true ]]; then
	if [[ "$NEWLINESET" != true ]]; then
		echo '' >> ~/.bashrc
		NEWLINESET=true
	fi
	echo "Setting 'mocknetstop' alias";
	echo "alias mocknetstop='dt=\$(pwd); cd $(pwd); node --no-warnings MockNet.js -stop -folderPath \$dt; cd \$dt;'" >> ~/.bashrc
fi

source ~/.bashrc

echo "Setup complete"