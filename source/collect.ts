import dotenv from "dotenv";
import bs58 from "bs58";
import {
    Keypair,
    Connection,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    SystemProgram
} from "@solana/web3.js";

import {
    createAssociatedTokenAccountIdempotentInstruction,
    createAssociatedTokenAccountInstruction,
    createCloseAccountInstruction,
    createTransferCheckedInstruction,
    getAccount,
    getAssociatedTokenAddress,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { createAndSendBundle, updateRecentBlockHash } from "./utils/common";
import { getWallets } from "./bot/action";
import { SPL_ACCOUNT_LAYOUT } from "@raydium-io/raydium-sdk";

dotenv.config();

export const networkName = process.env.SOLANA_RPC_URL || "mainnet";
console.log("RPC:", networkName);

export const connection = new Connection(networkName, "finalized");

const MAX_WALLET_COUNT = 10000;//process.env.MAX_WALLET_COUNT ? parseInt(process.env.MAX_WALLET_COUNT) : 0;
const DEV_WALLET_KEY = process.env.DEV_BONUS_WALLET ? process.env.DEV_BONUS_WALLET : "";
const DEV_WALLET = Keypair.fromSecretKey(bs58.decode(DEV_WALLET_KEY));
const WALLET_COUNT_PER_TX = 5;
const TX_COUNT_PER_BUNDLE = 4;


const main = async () => {

    let walletIdx = 0;

    console.log("MAX_WALLET_COUNT:", MAX_WALLET_COUNT);
    console.log("DEV_WALLET:", DEV_WALLET.publicKey.toString());

    const tokenMintKeyList: PublicKey[] = [];

    while (walletIdx < MAX_WALLET_COUNT) {

        const versionedTx = [];
        const walletList = [];
        let idxTx = 0;

        while (idxTx < TX_COUNT_PER_BUNDLE && walletIdx < MAX_WALLET_COUNT) {

            const wallets = await getWallets(walletIdx, WALLET_COUNT_PER_TX);
            const signers: Keypair[] = [];

            const instructions = [];

            for (const wallet of wallets) {

                console.log("wallet.publicKey", wallet.publicKey.toString());
                const balance = await connection.getBalance(wallet.publicKey);
                const accountList = await getOwnerTokenAccounts(wallet);
                const currentInst = instructions.length;

                if (balance == 0 && accountList.length == 0) {
                    continue;
                }

                if (balance > 0) {
                    instructions.push(
                        SystemProgram.transfer({
                            fromPubkey: wallet.publicKey,
                            toPubkey: DEV_WALLET.publicKey,
                            lamports: balance,
                        })
                    );
                }

                for (const account of accountList) {

                    const dstKey = await getAssociatedTokenAddress(account.mintKey, DEV_WALLET.publicKey);

                    const tokenAccountInfo = await connection.getAccountInfo(dstKey, 'finalized');

                    if (!tokenAccountInfo) {

                        if (tokenMintKeyList.indexOf(account.mintKey) == -1) {
                            tokenMintKeyList.push(account.mintKey);

                            instructions.push(
                                createAssociatedTokenAccountIdempotentInstruction(
                                    DEV_WALLET.publicKey,
                                    dstKey,
                                    DEV_WALLET.publicKey,
                                    account.mintKey,
                                )
                            )
                        }
                    }

                    if (account.amount > 0) {
                        instructions.push(
                            createTransferCheckedInstruction(
                                account.pubKey,
                                account.mintKey,
                                dstKey,
                                wallet.publicKey,
                                Math.floor(account.amount * 10 ** account.decimals),
                                account.decimals,
                            )
                        )
                    } else {
                        instructions.push(
                            createCloseAccountInstruction(
                                account.pubKey,
                                DEV_WALLET.publicKey,
                                wallet.publicKey,
                                [wallet],
                            )
                        )
                    }
                }
                
                console.log("instructions.length", instructions.length);

                if (currentInst < instructions.length)
                    signers.push(wallet);
            }

            if (instructions.length > 0) {
                const tx = await getVersionedTransaction(connection, DEV_WALLET.publicKey, instructions);

                versionedTx.push(tx);

                walletList.push(signers);

                idxTx++;
            }

            walletIdx += WALLET_COUNT_PER_TX;

            console.log("transfer processed", walletIdx);
        }

        console.log("transfer processed", walletIdx);

        if (versionedTx.length > 0) {

            // console.log("versionedTx", versionedTx.length);

            let res = false;

            await updateRecentBlockHash(connection, versionedTx);

            for (idxTx = 0; idxTx < versionedTx.length; idxTx++) {

                // console.log("idxTx", idxTx);
                const wallets = walletList[idxTx];
                wallets.push(DEV_WALLET);

                versionedTx[idxTx].sign(wallets);

                const simRes = await connection.simulateTransaction(versionedTx[idxTx]);
                versionedTx[idxTx].serialize();

                if (simRes.value.err) {
                    console.log("simRes", simRes, simRes.value.err);
                }
            }

            res = await createAndSendBundle(connection, DEV_WALLET, versionedTx);
        }
    }

    walletIdx = 0;

    while (walletIdx < MAX_WALLET_COUNT) {

        const versionedTx = [];
        const walletList = [];
        let idxTx = 0;

        while (idxTx < TX_COUNT_PER_BUNDLE && walletIdx < MAX_WALLET_COUNT) {

            const wallets = await getWallets(walletIdx, WALLET_COUNT_PER_TX);
            const signers: Keypair[] = [];
            const instructions = [];

            for (const wallet of wallets) {

                const currentInst = instructions.length;

                // console.log("wallet.publicKey", wallet.publicKey.toString());
                const accountList = await getOwnerTokenAccounts(wallet);

                for (const account of accountList) {
                    instructions.push(
                        createCloseAccountInstruction(
                            account.pubKey,
                            DEV_WALLET.publicKey,
                            wallet.publicKey,
                            [wallet],
                        )
                    )
                }

                if (currentInst < instructions.length)
                    signers.push(wallet);
            }

            if (instructions.length > 0) {
                const tx = await getVersionedTransaction(connection, DEV_WALLET.publicKey, instructions);

                versionedTx.push(tx);

                walletList.push(signers);

                idxTx++;
            }

            walletIdx += WALLET_COUNT_PER_TX;
        }

        console.log("closed processed", walletIdx);

        if (versionedTx.length > 0) {

            // console.log("versionedTx", versionedTx.length);

            await updateRecentBlockHash(connection, versionedTx);

            for (idxTx = 0; idxTx < versionedTx.length; idxTx++) {

                // console.log("idxTx", idxTx);
                const wallets = walletList[idxTx];
                wallets.push(DEV_WALLET);

                versionedTx[idxTx].sign(wallets);


                const simRes = await connection.simulateTransaction(versionedTx[idxTx]);
                versionedTx[idxTx].serialize();

                if (simRes.value.err) {
                    console.log("simRes", simRes, simRes.value.err);
                }
            }

            let res = false;
            res = await createAndSendBundle(connection, DEV_WALLET, versionedTx);
        }
    }
}

main();

async function getVersionedTransaction(
    connection: Connection,
    ownerPubkey: PublicKey,
    instructionArray: TransactionInstruction[]
) {
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
        payerKey: ownerPubkey,
        instructions: instructionArray,
        recentBlockhash: recentBlockhash,
    }).compileToV0Message();

    return new VersionedTransaction(messageV0);
}

const getOwnerTokenAccounts = async (keypair: Keypair) => {
    const walletTokenAccount = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, {
        programId: TOKEN_PROGRAM_ID,
    })

    return walletTokenAccount.value.map((i) => ({
        pubKey: i.pubkey,
        mintKey: new PublicKey(i.account.data.parsed.info.mint),
        amount: Number(i.account.data.parsed.info.tokenAmount.uiAmount),
        decimals: Number(i.account.data.parsed.info.tokenAmount.decimals),
    }))
}
