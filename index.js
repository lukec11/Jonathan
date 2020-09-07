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

const blocks = require('./blocks.js');

/**
 * Escape Slack message to prevent ping injection and double pings
 *
 * @param {string} text to escape
 * @returns {string} the escaped text
 */
function escapeMessage(text) {
  return (
    text
      // now, escape all user text according to the guide https://api.slack.com/reference/surfaces/formatting#escaping
      .replace(/&/g, '&amp;')
      .replace(/<\s*![^>]*>/g, 'group')
  );
}

/**
 *
 * @param {String} channelId | ID of channel to check/join
 * @param {String} token | slack token for which to check channel membership
 */
async function checkJoinChannel({ channelId, token }) {
  try {
    const res = await app.client.conversations.info({
      token: token,
      channel: channelId,
      include_num_members: false,
      include_locale: false
    });

    //check for a bad response & throw it
    if (!res.ok) {
      //check if the channel wasn't found
      if (res.error === 'channel_not_found') {
        // it couldn't find the channel, so we'll return false
        // a false return indicates later that it'll send via webhook
        return false;
      }
      // if it isn't returning false, it'll throw an error
      throw res;
    }

    if (res.channel.is_member) {
      return true;
    } else {
      await app.client.conversations.join({
        channel: channelId,
        token: token
      });
      return true;
    }
  } catch (err) {
    console.error(err);
    return false;
  }
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
  return `<!date^${timestamp}^{date_short_pretty} at {time}^${linkToTime}|${fallbackText}>`;
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

/**
 * Send an error to HoneyBadger
 * @param {Error} err | an error object
 */
async function localizeMessageShortcut({ shortcut, ack, context, payload }) {
  await ack(); // Acknowledge shortcut request
  let timeMatches;

  try {
    // convert Slack's message timestamp to a Date object
    const messageTime = new Date(
      Number(shortcut.message.ts.split('.')[0]) * 1000
    );

    // escape the original message to prevent SPI / double mentions for subteams
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

    // we divide by 60 to get the user's timezone offset in minutes, as expected by chrono
    const timezoneOffset = originalPoster.user.tz_offset / 60;

    const convertedMessage = localizeMessageTimes(
      originalMessage,
      timeMatches,
      timezoneOffset
    );

    //check if user is in the channel
    const inChannel = await checkJoinChannel({
      channelId: shortcut.channel.id,
      token: context.botToken
    });

    //check if shortcut runner is original messager
    if (shortcut.message.user === shortcut.user.id) {
      //check if the app is in the channel
      if (inChannel) {
        // It's in the channel, so show in thread with full visibility
        await app.client.chat.postMessage({
          token: process.env.SLACK_OAUTH_TOKEN,
          channel: shortcut.channel.id,
          thread_ts: shortcut.message.ts,
          text:
            `:sparkles: Here's <@${shortcut.message.user}>'s post in your timezone:\n` +
            convertedMessage.replace(/^|\n/g, '\n>')
        });
      } else {
        //not in the channel, so we send as a modal
        await app.client.views.open(
          blocks.messageModal({
            token: context.bot_token,
            trigger_id: payload.trigger_id,
            text: convertedMessage,
            helpText: `Hint: Want others to be able to see this? Invite <@U019XGT657V> to the channel.`
          })
        );
      }
    } else {
      // It's not the original user, so we show a modal
      await app.client.views.open(
        blocks.messageModal({
          // The token you used to initialize your app is stored in the `context` object
          token: context.bot_token,
          trigger_id: payload.trigger_id,
          text: convertedMessage,
          helpText: `\n\nBy the way, you should ask <@${shortcut.user.id}> to trigger this on their own message: I'll reply in-thread and magically convert the times for everyone.`
        })
      );
    }
    //send response message
  } catch (err) {
    console.error(err);

    // Send error to HoneyBadger w/ context
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
  }
}

(async () => {
  app.shortcut('check_timestamps', localizeMessageShortcut);
  app.shortcut('convert_times', localizeMessageShortcut);

  await app.start(3000);
  console.log('online');
})();
