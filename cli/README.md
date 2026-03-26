## CLI transfer tool
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
node ./cli/index.js transfer <blockchain> <sender> <receiver> <amount> -k <privateKey> -t <ftoken> -n <mainnet | testnet> -r <rpc> -y
```
### Arguments
```bash
blockchain # value is sui / near / aptos / solana / ton 
sender     # value is sender address 
receiver   # value is receiver address 
amount     # value is transfer amount
```

### Flags
```bash
--privateKey, -k  # value is private key
--network, -n     # value is mainnet or testnet
--token, -t       # value is fungible token contract address. Default is native token (Optional)
--rpc, -r         # value is a custom RPC URL. (Optional)
--memo, -m        # TON memo value. (Optional)
--yes, -y         # automatic yes to prompts. (Optional)
```

### RPC Node Notice
> The default RPC endpoints built into the CLI are public nodes that may be subject to rate limiting or require no authentication. For production use, it is recommended to register your own API key with the corresponding blockchain RPC provider and pass your custom RPC URL via the `-r` flag:
> ```bash
> node ./cli/index.js transfer <blockchain> <sender> <receiver> <amount> -r <your-custom-rpc-url>
> ```

### Security Notice
> **Warning:** Avoid passing your private key via the `-k` flag in production. Command-line arguments are visible in shell history (`~/.bash_history`, `~/.zsh_history`) and process listings (`ps aux`), which may expose your key to other users on the same machine.
>
> **Recommended:** Omit the `-k` flag and enter your private key through the interactive prompt instead — the input will be masked and will not be logged.