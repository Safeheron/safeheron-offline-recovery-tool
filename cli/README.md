## Near transfer cli
### Prerequisites
The cli is built by NodeJS. So you must install NodeJS >= 16. Recommended [Node16.16.0](https://nodejs.org/dist/v16.16.0/) . 

If you already have nodejs installed, you need to install the project's npm dependencies.
```
npm install
```
If everything is installed successfully, you can run the cli.

### Usage
```bash
// method one (Recommend)
npm run transfer

// method two
node ./cli/index.js transfer

// method three
node ./cli/index.js transfer <blockchain> <sender> <receiver> <amount> -k <privateKey> -t <ftoken> -r <rpc> -y
```
### Arguments
```bash
sender    # value is sender address 
receiver  # value is receiver address 
amount    # value is transfer amount
```

### Flags
```bash
--privateKey, -k  # value is private key
--network, -n     # value is mainnet or testnet
--token, -t       # value is fungible token contract address. Default is native token (Optional)
--rpc, -r         # value is a custom RPC URL. (Optional)
--yes, -y         # automatic yes to prompts. (Optional)
```