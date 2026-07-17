import os from 'node:os';
import path from 'node:path';

export function requireIsolatedHome() {
  const home = process.env.HOME?.trim();
  if (!home) {
    throw new Error('Test fixture runner requires HOME to be set to an isolated temp directory.');
  }

  const realUserHome = os.userInfo().homedir || os.homedir();

  if (path.resolve(home) === path.resolve(realUserHome)) {
    throw new Error(
      'Test fixture runner refuses to write wallet fixtures into the real user HOME. Set HOME to an isolated temp directory first.'
    );
  }
}
