require('@matterlabs/hardhat-zksync');

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      zksync: true
    }
  },
  solidity: {
    version: '0.8.30'
  },
  zksolc: {
    version: '1.5.15',
    settings: {
      codegen: 'yul'
    }
  },
  paths: {
    sources: './contracts',
    cache: './cache-zk',
    artifacts: './artifacts-zk'
  }
};
