import { compileStandardTestToken, getArtifactPath, writeArtifact } from './compiler.js';

const artifact = compileStandardTestToken();
writeArtifact(artifact);

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      contractName: artifact.contractName,
      artifactPath: getArtifactPath()
    },
    null,
    2
  ) + '\n'
);
