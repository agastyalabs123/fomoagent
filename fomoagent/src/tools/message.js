/**
 * Message tool — sends messages back to the user via API callback.
 * Mirrors nanobot's agent/tools/message.py but API-only (no channels).
 */

import { Tool } from './base.js';

export class MessageTool extends Tool {
  constructor({ sendCallback } = {}) {
    super();
    this._sendCallback = sendCallback;
    this._sentInTurn = false;
    this._channel = 'api';
    this._chatId = 'direct';
  }

  setContext(channel, chatId) {
    this._channel = channel;
    this._chatId = chatId;
  }

  setSendCallback(cb) {
    this._sendCallback = cb;
  }

  startTurn() {
    this._sentInTurn = false;
  }

  get sentInTurn() { return this._sentInTurn; }

  get name() { return 'message'; }
  get description() { return 'Send a message to the user. Use this to send intermediate results or status updates.'; }
  get parameters() {
    return {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Message content to send' },
      },
      required: ['content'],
    };
  }

  async execute({ content }) {
    if (!content) return 'Error: No content provided';
    if (!this._sendCallback) return 'Error: Message sending not configured';

    try {
      await this._sendCallback({
        channel: this._channel,
        chatId: this._chatId,
        content,
      });
      this._sentInTurn = true;
      return `Message sent to ${this._channel}:${this._chatId}`;
    } catch (e) {
      return `Error sending message: ${e.message}`;
    }
  }
}
