'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.messageModal = messageModal;

function messageModal(_ref) {
  var token = _ref.token,
    trigger_id = _ref.trigger_id,
    text = _ref.text,
    helpText = _ref.helpText;
  return {
    token: token,
    trigger_id: trigger_id,
    view: {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: 'Jonathan'
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
            text: text
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: helpText
            }
          ]
        }
      ]
    }
  };
}
//# sourceMappingURL=blocks.js.map
