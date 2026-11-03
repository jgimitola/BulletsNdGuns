// Railway infrastructure for the game. Apply changes with `railway config plan` then
// `railway config apply`; Railway does not read this file on deploy. See docs/deployment.md.
import { defineRailway, preserve, project, service, volume } from 'railway/iac';

/** US East (Virginia): the Railway region closest to players in Colombia. */
const REGION = 'us-east4-eqdc4a';

export const partial = 'game';

export default defineRailway(() => {
  // The SQLite file (accounts and levels). The Dockerfile points DATABASE_PATH here.
  const data = volume('game-data', { region: REGION });

  const game = service('game', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    // Rooms live in memory and SQLite is a local file: exactly one replica, always.
    replicas: { [REGION]: 1 },
    deploy: {
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
      // Asleep, the server would drop every socket and room.
      sleepApplication: false,
    },
    healthcheck: '/healthz',
    healthcheckTimeout: 60,
    volumeMounts: { '/data': data },
    env: {
      // Railway injects its own PORT (8080), but the domain targets 3000, the port the Dockerfile uses.
      PORT: '3000',
      // Set once from the CLI (see docs/deployment.md); never written here.
      BETTER_AUTH_SECRET: preserve(),
      // Railway fills in the service's generated domain.
      BETTER_AUTH_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      // Railway's edge proxy sits in front of the server: one hop to trust for the player's IP.
      TRUST_PROXY: '1',
    },
  });

  return project('bulletsndguns', { resources: [game, data] });
});
