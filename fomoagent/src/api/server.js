/**
 * HTTP API server — Express, no channels.
 * API-only agent interface with streaming support.
 */

import express from 'express';

export function createApiServer({ agentLoop }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'fomoagent' });
  });

  // Status
  app.get('/v1/status', (req, res) => {
    const sessionId = req.query.session || 'api:default';
    res.json(agentLoop.getStatus(sessionId));
  });

  // List sessions
  app.get('/v1/sessions', (_req, res) => {
    res.json(agentLoop.sessions.listSessions());
  });

  app.get('/v1/runs', (_req, res) => {
    res.json(agentLoop.listBackgroundRuns());
  });

  app.post('/v1/runs/cancel', (req, res) => {
    const runId = req.body?.runId;
    if (!runId) return res.status(400).json({ error: 'runId is required' });
    res.json(agentLoop.cancelRun(runId));
  });

  app.get('/v1/cron/jobs', (_req, res) => {
    if (!agentLoop.cronService) return res.status(404).json({ error: 'cron not enabled' });
    res.json(agentLoop.cronService.listJobs());
  });

  app.post('/v1/cron/jobs/:id/run', async (req, res) => {
    if (!agentLoop.cronService) return res.status(404).json({ error: 'cron not enabled' });
    try {
      const result = await agentLoop.cronService.runJobNow(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/v1/cron/jobs/:id/enable', (req, res) => {
    if (!agentLoop.cronService) return res.status(404).json({ error: 'cron not enabled' });
    try {
      const result = agentLoop.cronService.setEnabled(req.params.id, true);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/v1/cron/jobs/:id/disable', (req, res) => {
    if (!agentLoop.cronService) return res.status(404).json({ error: 'cron not enabled' });
    try {
      const result = agentLoop.cronService.setEnabled(req.params.id, false);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/v1/heartbeat/status', (_req, res) => {
    if (!agentLoop.heartbeatService) return res.status(404).json({ error: 'heartbeat not enabled' });
    res.json(agentLoop.heartbeatService.getStatus());
  });

  // New session
  app.post('/v1/sessions/new', async (req, res) => {
    const sessionId = req.body?.sessionId || 'api:default';
    const result = await agentLoop.newSession(sessionId);
    res.json(result);
  });

  // Chat — standard (non-streaming)
  app.post('/v1/chat', async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) is required.' });
    }

    try {
      const result = await agentLoop.process({
        sessionId: sessionId || 'api:default',
        message,
      });
      return res.json(result);
    } catch (error) {
      console.error('Chat error:', error);
      return res.status(500).json({ error: 'Agent processing failed.', detail: error.message });
    }
  });

  // Chat — streaming (SSE)
  app.post('/v1/chat/stream', async (req, res) => {
    const { message, sessionId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) is required.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await agentLoop.process({
        sessionId: sessionId || 'api:default',
        message,
        streaming: true,
        onStream: async (delta) => {
          send('delta', { content: delta });
        },
        onStreamEnd: async (resuming) => {
          send('stream_end', { resuming });
        },
        onProgress: async (hint) => {
          send('progress', { hint });
        },
      });

      send('done', {
        reply: result.reply,
        usage: result.usage,
        toolsUsed: result.toolsUsed,
        stopReason: result.stopReason,
      });
    } catch (error) {
      send('error', { error: error.message });
    } finally {
      res.end();
    }
  });

  return app;
}
