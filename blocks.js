function messageModal({ token, trigger_id, text, helpText }) {
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

module.exports = {
  messageModal
};
