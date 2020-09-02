require("dotenv").config();
const { App } = require("@slack/bolt");
const chrono = require("chrono-node");

//univeral shit
const MINUTES_IN_HOUR = 60;
const MS_IN_SECOND = 1000;

const app = new App({
	token: process.env.SLACK_OAUTH_TOKEN,
	signingSecret: process.env.SLACK_SIGNING_SECRET
});

const getSlackOffset = async userId => {
	const userTzOffset = (
		await app.client.users.info({
			token: process.env.SLACK_OAUTH_TOKEN,
			user: userId
		})
	).user.tz_label

	return userTzOffset;
};

const getMatches = (message) => {
	const times = chrono.parse(message);
	let textMatches = [];
	for (const t of times) {
		textMatches.push(t.text);
		console.log(`found match ${t.text}`)
	}
	return textMatches;
}

const parseDate = async (dateString, userId) => {
	try {
		let date = "";

		//check to see the properties of the initial parse
		const initialParse = chrono.parse(dateString);
		if (
			!initialParse[0].start.knownValues.hasOwnProperty("timezoneOffset")
		) {
			// The timezone property isn't provided, so we need to grab the slack timezone and add it on
			const slackOffset = await getSlackOffset(userId);
			dateString += ` ${slackOffset}`;
		}
		// it already has a timezone applied
		return (chrono.parseDate(dateString).getTime() / MS_IN_SECOND).toFixed(0);
	} catch (err) {
		console.error(err);
	}
};

//listen for shortcut
app.shortcut("check_timestamps", async ({ shortcut, ack, respond }) => {
	try {
		await ack(); // Acknowledge shortcut request
		// get timezone matches from within the message
		let tzMatches = getMatches(shortcut.message.text);
		//check for potentially no matches
		if (tzMatches.length === 0) {
			await app.client.chat.postEphemeral({
				token: process.env.SLACK_OAUTH_TOKEN,
				text: `No timestamps found! If you think this is in error, reach out to <@UE8DH0UHM>.`,
				channel: shortcut.channel.id,
				thread_ts: shortcut.message.ts,
				user: shortcut.user.id
			});
			return;
		}
		// initialize array of timestamps
		let unixTimestamps = [];
		// translate timestamps into unix time
		for (const i of tzMatches) {
			let m = await parseDate(i, shortcut.user.id);
			unixTimestamps.push(m);
		}
		
		//generate final text to send
		let finalSend = "";
		// Add user callout at beginning
		finalSend += `Here are the posts's timestamps in your local time! (requested by <@${shortcut.user.id}>)\n\n`;
		for (let i = 0; i < tzMatches.length; i++) {
			finalSend += `\`"${tzMatches[i].trim()}"\`: <!date^${
				unixTimestamps[i]
			}^{date_short_pretty} at {time}|time>\n`;
		}
		//send response message
		await app.client.chat.postMessage({
			token: process.env.SLACK_OAUTH_TOKEN,
			channel: shortcut.channel.id,
			text: finalSend,
			thread_ts: shortcut.message.ts
		});
	} catch (err) {
		console.error(err);
	}
});

(async () => {
	await app.start(3000);
	console.log("online");
})();
