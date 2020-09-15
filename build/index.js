'use strict';

var _interopRequireWildcard = require('@babel/runtime/helpers/interopRequireWildcard');

var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault');

var _objectWithoutProperties2 = _interopRequireDefault(
  require('@babel/runtime/helpers/objectWithoutProperties')
);

var _regenerator = _interopRequireDefault(
  require('@babel/runtime/regenerator')
);

var _asyncToGenerator2 = _interopRequireDefault(
  require('@babel/runtime/helpers/asyncToGenerator')
);

var chrono = _interopRequireWildcard(require('chrono-node'));

var _bolt = require('@slack/bolt');

require('dotenv/config');

var _honeybadger = _interopRequireDefault(require('honeybadger'));

var _blocks = require('./blocks.js');

var Honeybadger = _honeybadger['default'].configure({
  apiKey: process.env.HONEYBADGER_API_KEY
});

var app = new _bolt.App({
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
  return text // now, escape all user text according to the guide https://api.slack.com/reference/surfaces/formatting#escaping
    .replace(/&/g, '&amp;')
    .replace(/<\s*![^>]*>/g, 'group');
}
/**
 * Checks and potentially joins a public channel, or returns false on private channels
 * @param {String} channelId | ID of channel to check/join
 * @param {String} token | slack token for which to check channel membership
 */

function checkJoinChannel(_x) {
  return _checkJoinChannel.apply(this, arguments);
}
/**
 * Localize a date for display in Slack
 *
 * @param {Date} date
 * @param {string} fallbackText
 * @returns {string} The localized date for display in Slack
 */

function _checkJoinChannel() {
  _checkJoinChannel = (0, _asyncToGenerator2['default'])(
    /*#__PURE__*/ _regenerator['default'].mark(function _callee2(_ref) {
      var channelId, token, res;
      return _regenerator['default'].wrap(
        function _callee2$(_context2) {
          while (1) {
            switch ((_context2.prev = _context2.next)) {
              case 0:
                (channelId = _ref.channelId), (token = _ref.token);
                _context2.prev = 1;
                _context2.next = 4;
                return app.client.conversations.info({
                  token: token,
                  channel: channelId,
                  include_num_members: false,
                  include_locale: false
                });

              case 4:
                res = _context2.sent;

                if (res.ok) {
                  _context2.next = 9;
                  break;
                }

                if (!(res.error === 'channel_not_found')) {
                  _context2.next = 8;
                  break;
                }

                return _context2.abrupt('return', false);

              case 8:
                throw res;

              case 9:
                if (!res.channel.is_member) {
                  _context2.next = 13;
                  break;
                }

                return _context2.abrupt('return', true);

              case 13:
                _context2.next = 15;
                return app.client.conversations.join({
                  channel: channelId,
                  token: token
                });

              case 15:
                return _context2.abrupt('return', true);

              case 16:
                _context2.next = 22;
                break;

              case 18:
                _context2.prev = 18;
                _context2.t0 = _context2['catch'](1);
                console.error(_context2.t0);
                return _context2.abrupt('return', false);

              case 22:
              case 'end':
                return _context2.stop();
            }
          }
        },
        _callee2,
        null,
        [[1, 18]]
      );
    })
  );
  return _checkJoinChannel.apply(this, arguments);
}

function localizeDate(date, fallbackText) {
  // convert date to a timestamp
  var timestamp = (date.getTime() / 1000).toFixed(0); // link to time.is for conversion to other timezones

  var linkToTime = 'https://time.is/'.concat(timestamp); // Further escape fallback text to prevent glitches with multiline or oddly formatted text

  fallbackText = fallbackText.replace(/\n|\^|\|/g, ' '); // make a localized date string

  return '<!date^'
    .concat(timestamp, '^{date_short_pretty} at {time}^')
    .concat(linkToTime, '|')
    .concat(fallbackText, '>');
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
  var convertedMessage = '';
  var convertedToIndex = 0;
  timeMatches.forEach(function (match) {
    // append the text between the last match and this match
    convertedMessage += originalMessage.slice(convertedToIndex, match.index);
    convertedToIndex = match.index + match.text.length; // If timezone property isn't implied, we'll imply the timezone set on the user's slack profile

    if (!match.start.impliedValues.hasOwnProperty('timezoneOffset')) {
      // Note that we're only implying values, so if chrono is sure that it knows the timezone, chrono will override our hint.
      match.start.impliedValues.timezoneOffset = timezoneOffset;
    } // insert in the converted message

    convertedMessage += localizeDate(match.start.date(), match.text);

    if (match.end != null) {
      // If timezone property isn't implied, we'll imply the timezone set on the user's slack profile
      if (!match.end.impliedValues.hasOwnProperty('timezoneOffset')) {
        // Note that we're only implying values, so if chrono is sure that it knows the timezone, chrono will override our hint.
        match.end.impliedValues.timezoneOffset = timezoneOffset;
      } // insert in the converted message

      convertedMessage += ' to ' + localizeDate(match.end.date(), 'end time');
    }
  }); // make sure to append any text after the last date match

  convertedMessage += originalMessage.slice(convertedToIndex);
  return convertedMessage;
}
/**
 * Send an error to HoneyBadger
 * @param {Error} err | an error object
 */

function localizeMessageShortcut(_x2) {
  return _localizeMessageShortcut.apply(this, arguments);
}

function _localizeMessageShortcut() {
  _localizeMessageShortcut = (0, _asyncToGenerator2['default'])(
    /*#__PURE__*/ _regenerator['default'].mark(function _callee3(_ref2) {
      var shortcut,
        ack,
        context,
        payload,
        timeMatches,
        messageTime,
        originalMessage,
        i,
        originalPoster,
        timezoneOffset,
        convertedMessage,
        inChannel,
        stack,
        code,
        message,
        error_details;
      return _regenerator['default'].wrap(
        function _callee3$(_context3) {
          while (1) {
            switch ((_context3.prev = _context3.next)) {
              case 0:
                (shortcut = _ref2.shortcut),
                  (ack = _ref2.ack),
                  (context = _ref2.context),
                  (payload = _ref2.payload);
                _context3.next = 3;
                return ack();

              case 3:
                _context3.prev = 3;
                // convert Slack's message timestamp to a Date object
                messageTime = new Date(
                  Number(shortcut.message.ts.split('.')[0]) * 1000
                ); // escape the original message to prevent SPI / double mentions for subteams

                originalMessage = escapeMessage(shortcut.message.text); // get timezone matches from within the message

                timeMatches = chrono.parse(originalMessage, messageTime); // Remove time matches which only have dates & not a specific hour, or are too specific (to avoid matching things like "now")

                for (i = timeMatches.length - 1; i >= 0; --i) {
                  if (
                    !timeMatches[i].start.knownValues.hasOwnProperty('hour') ||
                    timeMatches[i].start.knownValues.hasOwnProperty(
                      'millisecond'
                    )
                  ) {
                    timeMatches.splice(i, 1);
                  }
                } //check for potentially no matches

                if (!(timeMatches.length === 0)) {
                  _context3.next = 10;
                  break;
                }

                return _context3.abrupt(
                  'return',
                  app.client.chat.postEphemeral({
                    token: process.env.SLACK_OAUTH_TOKEN,
                    text:
                      "I couldn't find a time in the message to convert. If you think this is in error, please <https://github.com/lukec11/Jonathan/issues/new|file an issue>.",
                    channel: shortcut.channel.id,
                    thread_ts: shortcut.message.ts,
                    user: shortcut.user.id
                  })
                );

              case 10:
                _context3.next = 12;
                return app.client.users.info({
                  token: process.env.SLACK_OAUTH_TOKEN,
                  user: shortcut.message.user
                });

              case 12:
                originalPoster = _context3.sent;
                // we divide by 60 to get the user's timezone offset in minutes, as expected by chrono
                timezoneOffset = originalPoster.user.tz_offset / 60;
                convertedMessage = localizeMessageTimes(
                  originalMessage,
                  timeMatches,
                  timezoneOffset
                ); //check if user is in the channel

                _context3.next = 17;
                return checkJoinChannel({
                  channelId: shortcut.channel.id,
                  token: context.botToken
                });

              case 17:
                inChannel = _context3.sent;

                if (!(shortcut.message.user === shortcut.user.id)) {
                  _context3.next = 28;
                  break;
                }

                if (!inChannel) {
                  _context3.next = 24;
                  break;
                }

                _context3.next = 22;
                return app.client.chat.postMessage({
                  token: process.env.SLACK_OAUTH_TOKEN,
                  channel: shortcut.channel.id,
                  thread_ts: shortcut.message.ts,
                  text:
                    ":sparkles: Here's <@".concat(
                      shortcut.message.user,
                      ">'s post in your timezone:\n"
                    ) + convertedMessage.replace(/^|\n/g, '\n>')
                });

              case 22:
                _context3.next = 26;
                break;

              case 24:
                _context3.next = 26;
                return app.client.views.open(
                  (0, _blocks.messageModal)({
                    token: context.botToken,
                    trigger_id: payload.trigger_id,
                    text: convertedMessage,
                    helpText:
                      'Hint: Want others to be able to see this? Invite <@U019XGT657V> to the channel.'
                  })
                );

              case 26:
                _context3.next = 30;
                break;

              case 28:
                _context3.next = 30;
                return app.client.views.open(
                  (0, _blocks.messageModal)({
                    // The token you used to initialize your app is stored in the `context` object
                    token: context.botToken,
                    trigger_id: payload.trigger_id,
                    text: convertedMessage,
                    helpText: '\n\nBy the way, you should ask <@'.concat(
                      shortcut.message.user,
                      "> to trigger this on their own message: I'll reply in-thread and magically convert the times for everyone."
                    )
                  })
                );

              case 30:
                _context3.next = 37;
                break;

              case 32:
                _context3.prev = 32;
                _context3.t0 = _context3['catch'](3);
                console.error(_context3.t0); // Send error to HoneyBadger w/ context

                (stack = _context3.t0.stack),
                  (code = _context3.t0.code),
                  (message = _context3.t0.message),
                  (error_details = (0,
                  _objectWithoutProperties2['default'])(_context3.t0, [
                    'stack',
                    'code',
                    'message'
                  ]));
                Honeybadger.notify(
                  {
                    stack: stack,
                    code: code,
                    message: message
                  },
                  {
                    context: {
                      timeMatches: timeMatches,
                      message: {
                        ts: shortcut.message.ts,
                        text: shortcut.message.text
                      },
                      channelId: shortcut.channel.id,
                      userId: shortcut.user.id,
                      teamId: shortcut.team.id,
                      error_details: error_details
                    }
                  }
                );

              case 37:
              case 'end':
                return _context3.stop();
            }
          }
        },
        _callee3,
        null,
        [[3, 32]]
      );
    })
  );
  return _localizeMessageShortcut.apply(this, arguments);
}

(0, _asyncToGenerator2['default'])(
  /*#__PURE__*/ _regenerator['default'].mark(function _callee() {
    return _regenerator['default'].wrap(function _callee$(_context) {
      while (1) {
        switch ((_context.prev = _context.next)) {
          case 0:
            app.shortcut('check_timestamps', localizeMessageShortcut);
            app.shortcut('convert_times', localizeMessageShortcut);
            _context.next = 4;
            return app.start(3000);

          case 4:
            console.log('online');

          case 5:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee);
  })
)();
//# sourceMappingURL=index.js.map
