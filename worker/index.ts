export { BaseRoom } from './BaseRoom';

/** Name of the one shared base. Every client connects to the same Durable Object. */
const BASE_NAME = 'base';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      return env.BASE_ROOM.getByName(BASE_NAME).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
