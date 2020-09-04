require('dotenv').config();
const { App } = require('@slack/bolt');
const chrono = require('chrono-node');

const Honeybadger = require('honeybadger').configure({
  apiKey: process.env.HONEYBADGER_API_KEY
});

const app = new App({
  token: process.env.SLACK_OAUTH_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

/**
 * Escape Slack message to prevent ping injection and double pings
 *
 * @param {string} text to escape
 * @returns {string} the escaped text
 */
function escapeMessage(text) {
  return (
    text
      // more user-friendly text replacements:
      .replace(/<@[^>]*>/g, 'user')
      .replace(/<!(subteam)[^>]*>/g, 'group')
      // now, escape all user text according to the guide https://api.slack.com/reference/surfaces/formatting#escaping
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  );
}

/**
 * Localize a date for display in Slack
 *
 * @param {Date} date
 * @param {string} fallbackText
 * @returns {string} The localized date for display in Slack
 */
function localizeDate(date, fallbackText) {
  // convert date to a timestamp
  const timestamp = (date.getTime() / 1000).toFixed(0);

  // link to time.is for conversion to other timezones
  const linkToTime = `https://time.is/${timestamp}`;

  // Further escape fallback text to prevent glitches with multiline or oddly formatted text
  fallbackText = fallbackText.replace(/\n|\^|\|/g, ' ');

  // make a localized date string
  const localizedStr = `<!date^${timestamp}^{date_short_pretty} at {time}^${linkToTime}|${fallbackText}>\n`;

  return localizedStr;
}

/**
 * Localize a message's times
 *
 * @param {string} originalMessage
 * @param {any[]} timeMatches
 * @param {number} timezoneOffsetMinutes The timezone offset of the user, in minutes
 * @returns {string}
 */
function localizeMessageTimes(originalMessage, timeMatches, timezoneOffset) {
  let convertedMessage = '';
  let convertedToIndex = 0;

  timeMatches.forEach(match => {
    // append the text between the last match and this match
    convertedMessage += originalMessage.slice(convertedToIndex, match.index);
    convertedToIndex = match.index + match.text.length;

    // If timezone property isn't implied, we'll imply the timezone set on the user's slack profile
    if (!match.start.impliedValues.hasOwnProperty('timezoneOffset')) {
      // Note that we're only implying values, so if chrono is sure that it knows the timezone, chrono will override our hint.
      match.start.impliedValues.timezoneOffset = timezoneOffset;
    }

    // insert in the converted message
    convertedMessage += localizeDate(match.start.date(), match.text);

    if (match.end != null) {
      // If timezone property isn't implied, we'll imply the timezone set on the user's slack profile
      if (!match.end.impliedValues.hasOwnProperty('timezoneOffset')) {
        // Note that we're only implying values, so if chrono is sure that it knows the timezone, chrono will override our hint.
        match.end.impliedValues.timezoneOffset = timezoneOffset;
      }

      // insert in the converted message
      convertedMessage += ' to ' + localizeDate(match.end.date(), 'end time');
    }
  });

  // make sure to append any text after the last date match
  convertedMessage += originalMessage.slice(convertedToIndex);

  return convertedMessage;
}

async function localizeMessageShortcut({ shortcut, ack, context, payload }) {
  let timeMatches;

  try {
    // convert Slack's message timestamp to a Date object;
    const messageTime = new Date(
      Number(shortcut.message.ts.split('.')[0]) * 1000
    );

    // escape the original message to prevent slack ping injection / double pings
    const originalMessage = escapeMessage(shortcut.message.text);

    // get timezone matches from within the message
    timeMatches = chrono.parse(originalMessage, messageTime);

    //check for potentially no matches
    if (timeMatches.length === 0) {
      return app.client.chat.postEphemeral({
        token: process.env.SLACK_OAUTH_TOKEN,
        text: `I couldn't find a time in the message to convert. If you think this is in error, please <https://github.com/lukec11/Jonathan/issues/new|file an issue>.`,
        channel: shortcut.channel.id,
        thread_ts: shortcut.message.ts,
        user: shortcut.user.id
      });
    }

    // Most of the time, a user will not provide a timezone in their message, so we'll hold it to simplify the base case.
    const originalPoster = await app.client.users.info({
      token: process.env.SLACK_OAUTH_TOKEN,
      user: shortcut.message.user
    });

    // we devide by 60 to get the user's timezone offset in minutes, as expected by chrono
    const timezoneOffset = originalPoster.user.tz_offset / 60;

    const convertedMessage = localizeMessageTimes(
      originalMessage,
      timeMatches,
      timezoneOffset
    );

    //check if shortcut runner is original messager
    if (shortcut.message.user === shortcut.user.id) {
      //show in thread with full visibility
      await app.client.chat.postMessage({
        token: process.env.SLACK_OAUTH_TOKEN,
        channel: shortcut.channel.id,
        thread_ts: shortcut.message.ts,
        text:
          `:sparkles: Here's <@${shortcut.message.user}>'s post in your timezone:\n` +
          convertedMessage.replace(/^|\n/g, '\n>')
      });
    } else {
      await app.client.views.open({
        // The token you used to initialize your app is stored in the `context` object
        token: context.botToken,
        trigger_id: payload.trigger_id,
        view: {
          title: {
            type: 'plain_text',
            text: 'Jonathan, timezone robot'
          },
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: "Here's that post in your timezone:",
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: convertedMessage
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `FYI, <@${shortcut.message.user}> is in ${originalPoster.user.tz_label}. You should tell them to trigger this shortcut on their own message so that I can magically convert the times for everyone.`
              }
            }
          ]
        }
      });
    }
    //send response message
  } catch (err) {
    console.error(err);

    // Extract details of the error which are not stack or message
    const { stack, code, message, ...error_details } = err;

    Honeybadger.notify(
      { stack, code, message },
      {
        context: {
          timeMatches,
          message: {
            ts: shortcut.message.ts,
            text: shortcut.message.text
          },
          channelId: shortcut.channel.id,
          userId: shortcut.user.id,
          teamId: shortcut.team.id,
          error_details
        }
      }
    );
  } finally {
    await ack(); // Acknowledge shortcut request
  }
}

(async () => {
  app.shortcut('check_timestamps', localizeMessageShortcut);

  await app.start(3000);
  console.log('online');
})();
