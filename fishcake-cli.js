const fs = require('fs');
const yaml = require('js-yaml');
const { program } = require('commander');
const { TezosToolkit } = require('@taquito/taquito');
const { InMemorySigner, importKey } = require('@taquito/signer');

program
	.option(
	    '-c, --config <config>',
	    'Path to the configuration YAML file',
	    'config.yaml');

program
	.command('prepare <supply>')
	.description('deploy token and airdrop contracts + mint tokens to airdrop contract (`tokenCodePath` and `airdropCodePath` variables of config point to Michelson code)')
	.action(prepare);

program
	.command('redeem <airdrop> <privatekey>')
	.description('[for testing] send redeem request to contract with the <airdrop> address on behalf of the account with <privatekey>')
	.action(redeem)

program
	.command('get-redeemed <airdrop>')
	.description('get amount of total redeemed tokens from the airdrop contract on the address <airdrop>')
	.action(getRedeemed);

program
	.command('has-redeemed <airdrop> <address>')
	.description('whether or not the <address> redeemed tokens from the airdrop contract on the address <address>')
	.action(hasRedeemed);

program
	.command('get-balance <token> <address>')
	.description('get balance of tokens (of <token> contract) on the <address>')
	.action(getBalance)


const configContents = fs.readFileSync(program.opts().config);
const config = yaml.load(configContents);

const Tezos = new TezosToolkit(config.rpcURL);
Tezos.setProvider({
  signer: new InMemorySigner(config.adminKey),
});


function prepare(supply) {
	let tokenAddress;
	let airdropAddress;

	Tezos.contract.originate({
			code: fs.readFileSync(config.tokenCodePath, 'utf8'),
			init: `(Pair (Pair "${config.adminAddress}" (Pair 0 {})) (Pair (Pair Unit {}) (Pair False {})))`
		})
		.then((originationOp) => {
			return originationOp.contract();
		})
		.then((contract) => {
			tokenAddress = contract.address;
			console.log(`Fishcake token contract deployed at ${tokenAddress}`);

			return Tezos.contract.originate({
				code: fs.readFileSync(config.airdropCodePath, 'utf8'),
				init: `(Pair (Pair 0 {}) (Pair 5 "${tokenAddress}"))`
			})
		})
		.then((originationOp) => {
			return originationOp.contract();
		})
		.then((contract) => {
			airdropAddress = contract.address
			console.log(`FishcakeBox contract deployed at ${airdropAddress}`);

			return Tezos.contract.at(tokenAddress)
		})
		.then((c) => {
			return c.methods.mint(airdropAddress, parseInt(supply), 'FISH', 0).send()
		})
		.then((op) => op.confirmation(1).then(() => true))
		.then((confirmed) => {
			console.log('Tokens minted to FishcakeBox. Airdrop prepared successfully')
		})
		.catch((error) => console.log(`Error: ${JSON.stringify(error, null, 2)}`));
}

function redeem(airdropAddress, key) {
	const tmpTezos = new TezosToolkit(config.rpcURL);
	tmpTezos.setProvider({
	  signer: new InMemorySigner(key),
	});

	let senderPKH;
	
	tmpTezos.signer.publicKeyHash()
		.then((pkh) => {
			senderPKH = pkh;
			return tmpTezos.contract.at(airdropAddress)
		})
		.then((c) => {
			return c.methods.redeem([[]]).send()
		})
		.then((op) => op.confirmation(1).then(() => true))
		.then((confirmed) => {
			console.log(`Tokens redeemed to ${senderPKH}`)
		})
		.catch((error) => console.log(`Error: ${JSON.stringify(error.message, null, 2)}`));
}

function getRedeemed(airdropAddress) {
	Tezos.contract.at(airdropAddress)
		.then((c) => {
			return c.storage()
		})
		.then((storage) => {
			console.log(storage['distributed'].toString())
		})
		.catch((error) => console.log(`Error: ${JSON.stringify(error, null, 2)}`));
}

function hasRedeemed(airdropAddress, address) {
	Tezos.contract.at(airdropAddress)
		.then((c) => {
			return c.views.hasRedeemed(address).read()
		})
		.then((response) => {
			console.log(response)
		})
		.catch((error) => console.log(`Error: ${JSON.stringify(error, null, 2)}`));
}

function getBalance(tokenAddress, address) {
	Tezos.contract.at(tokenAddress)
		.then((c) => {
			return c.views.balance_of([{owner: address, token_id: 0}]).read()
		})
		.then((response) => {
			console.log(response[0].balance.toString())
		})
		.catch((error) => console.log(`Error: ${JSON.stringify(error, null, 2)}`));
}

program.parse(process.argv);
