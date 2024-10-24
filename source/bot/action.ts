import bs58 from 'bs58';
import VolumeBotModel from "../database/models/volumebot.model";
import TokenModel from "../database/models/token.model";
import WalletModel from "../database/models/wallet.model";
import { BigNumber } from "bignumber.js";

import {
    Keypair,
    PublicKey,
    Connection,
} from "@solana/web3.js";

import {
    TOKEN_PROGRAM_ID,
    getMint,
    getAssociatedTokenAddressSync,
    getAccount
} from "@solana/spl-token";

import {
    Token,
} from "@raydium-io/raydium-sdk";

import { Raydium } from "@raydium-io/raydium-sdk-v2";

import { buyToken, createAndSendBundle, getPoolInfo, getTokenMetadata, sellToken } from '../utils/common';
import { BOT_STATUS, generateSolanaBotMessage } from '../utils/generateBotPanel';
import { MAX_WALLET_COUNT } from './const';
import DepositWallet from '../database/models/depositWallet.model';

const defaultCountsOfSubWallets =
    Number(process.env.DEFAULT_COUNTS_OF_SUB_WALLLETS) || 4;

const quoteToken = new Token(
    TOKEN_PROGRAM_ID,
    "So11111111111111111111111111111111111111112",
    9,
    "WSOL",
    "WSOL"
);

export const addMainWallet = async (
    connection: Connection,
    userId: any,
    inputText: string,
) => {
    const newKeypair = Keypair.fromSecretKey(bs58.decode(inputText));

    if (!newKeypair) {
        return null;
    }

    const userMainWalletBalance = await connection.getBalance(newKeypair.publicKey);
    console.log("MainWallet Address : ", newKeypair.publicKey.toBase58());
    console.log("SOL Amount of MainWallet : ", userMainWalletBalance);

    const botOnSolana: any = await VolumeBotModel.findOne({ userId: userId }).populate("mainWallet");
    if (inputText !== botOnSolana?.mainWallet?.privateKey) {
        const newMainWallet = new WalletModel({
            publicKey: newKeypair.publicKey.toBase58(),
            privateKey: inputText,
            userId: userId,
            level: "Main"
        });
        await newMainWallet.save();
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            mainWallet: newMainWallet._id,
            ref: "Wallet"
        });
    }
    return newKeypair;
}

export const createOrUpdateSubWallet = async (
    userId: any,
    subWalletCounts: number,
) => {
    const botOnSolana = await VolumeBotModel.findOne({
        userId: userId
    });
    if (botOnSolana !== null) {
        let subWallets = botOnSolana.subWallets;
        console.log("subWallets : ", subWallets);

        let walletId;
        if (subWallets.length < subWalletCounts) {
            for (let i = subWallets.length; i < subWalletCounts; i++) {
                const keypair = Keypair.generate();
                walletId = await WalletModel.create({
                    publicKey: keypair.publicKey.toBase58(),
                    privateKey: bs58.encode(keypair.secretKey),
                    userId: userId,
                    level: "Sub",
                });
                console.log("new ID : ", walletId._id);
                botOnSolana.subWallets.push(walletId._id);
            }
        } else {
            const count = botOnSolana.subWallets.length - subWalletCounts;
            botOnSolana.subWallets.splice(subWalletCounts, count);
        }
        await botOnSolana.save();

        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            subWalletNums: subWalletCounts,
        });
    }
}

export const updateTargetVolume = async (
    userId: any,
    targetVolumeAmount: number,
) => {
    const botOnSolana = await VolumeBotModel.findOne({
        userId: userId
    });

    if (botOnSolana !== null) {
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            targetVolume: Number(targetVolumeAmount?.toFixed(0)),
        });
    }
}

export const updateTargetHolder = async (
    userId: any,
    targetHDAmount: number,
) => {
    const botOnSolana = await VolumeBotModel.findOne({
        userId: userId
    });

    if (botOnSolana !== null) {
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            targetHD: Number(targetHDAmount?.toFixed(0)),
        });
    }
}

export const updateMarketMaker = async (
    userId: any,
    targetMMAmount: number,
) => {
    const botOnSolana = await VolumeBotModel.findOne({
        userId: userId
    });

    if (botOnSolana !== null) {
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            targetMM: Number(targetMMAmount?.toFixed(0)),
        });
    }
}

export const buyAction = async (
    connection: Connection,
    userId: any,
    inputText: string,
    raydium: Raydium | undefined
) => {

    if (raydium == undefined) {
        return 4;
    }
    const botOnSolana: any = await VolumeBotModel.findOne({
        userId: userId
    })
        .populate("mainWallet")
        .populate("token")

    const buySol = Number(inputText);
    console.log("buySol : ", buySol);
    const mainWallet = Keypair.fromSecretKey(bs58.decode(botOnSolana.mainWallet.privateKey));
    const balance = await connection.getBalance(mainWallet.publicKey);
    console.log("balance 0: ", balance);
    const solBalance = balance / 10 ** 9;
    console.log("balance : ", solBalance);

    let versionTx = [];
    if (buySol >= 0 && buySol < solBalance) {

        try {
            const token = botOnSolana.token.address;
            const baseToken = new Token(TOKEN_PROGRAM_ID, token, botOnSolana.token.decimals);

            // raydium.setOwner(mainWallet);
            const poolInfo = await getPoolInfo(connection, quoteToken, baseToken, raydium, userId);

            if (poolInfo == null) {
                return 3;
            }

            const buyTx = await buyToken(connection, mainWallet, buySol, quoteToken, baseToken, poolInfo, raydium);
            versionTx.push(buyTx?.transaction);
            const ret = await createAndSendBundle(connection, mainWallet, versionTx);

            return ret;
        } catch (err) {
            console.log("Buy token transaction is failed.");
        }
    } else {
        console.error(
            "Invalid input of SOL amount : ",
            buySol,
        );
    }
    return 2;
}

export const sellAction = async (
    connection: Connection,
    userId: any,
    inputText: string,
    raydium: Raydium | undefined
) => {

    if (raydium == undefined) {
        return 3;
    }

    const botOnSolana: any = await VolumeBotModel.findOne({
        userId: userId
    })
        .populate("mainWallet")
        .populate("token")

    const token = botOnSolana.token.address;
    const mint = new PublicKey(token);
    const mintInfo = await getMint(connection, mint);
    const mainWallet = Keypair.fromSecretKey(bs58.decode(botOnSolana.mainWallet.privateKey));
    const sourceAccount = getAssociatedTokenAddressSync(
        mint,
        mainWallet.publicKey
    );
    const tokenAccountInfo: any = await getAccount(connection, sourceAccount);
    if (tokenAccountInfo) {
        const _tokenAmount = new BigNumber(tokenAccountInfo.amount.toString())
            .multipliedBy(new BigNumber(inputText))
            .dividedBy(new BigNumber("100"));
        const tokenAmount = new BigNumber(
            _tokenAmount.toString() + "e-" + mintInfo.decimals
        ).toFixed(0, 1);

        console.log("tokenAmount : ", tokenAmount);
        if (Number(tokenAmount) === 0) {
            return 2;
        }
        let versionTx = [];
        try {
            const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
            const poolKeys = await getPoolInfo(connection, quoteToken, baseToken, raydium, userId);
            const sellTx = await sellToken(connection, mainWallet, tokenAmount, quoteToken, baseToken, poolKeys, raydium);
            versionTx.push(sellTx?.transaction);
            const ret = await createAndSendBundle(connection, mainWallet, versionTx);
            return ret;
        } catch (err) {
            console.log(err);
        }
        return 4;
    }
    else {
        console.error(
            "There is none token."
        );
    }
    return 4;
}

export const sellAllAction = async (
    connection: Connection,
    userId: any,
    raydium: Raydium | undefined
) => {

    if (raydium == undefined) {
        return 3;
    }

    const botOnSolana: any = await VolumeBotModel.findOne({
        userId: userId
    })
        .populate("mainWallet")
        .populate("token")

    const token = botOnSolana.token.address;
    const mint = new PublicKey(token);
    const mintInfo = await getMint(connection, mint);
    const mainWallet = Keypair.fromSecretKey(bs58.decode(botOnSolana.mainWallet.privateKey));
    const sourceAccount = getAssociatedTokenAddressSync(
        mint,
        mainWallet.publicKey
    );
    const tokenAccountInfo: any = await getAccount(connection, sourceAccount);
    if (tokenAccountInfo) {
        const tokenAmount = tokenAccountInfo.amount;

        console.log("tokenAmount : ", tokenAmount);
        if (Number(tokenAmount) === 0) {
            return 2;
        }
        let versionTx = [];
        try {
            const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
            const poolKeys = await getPoolInfo(connection, quoteToken, baseToken, raydium, userId);
            const sellTx = await sellToken(connection, mainWallet, tokenAmount, quoteToken, baseToken, poolKeys, raydium);
            versionTx.push(sellTx?.transaction);
            const ret = await createAndSendBundle(connection, mainWallet, versionTx);
            return ret;
        } catch (err) {
            console.log(err);
        }
        return 4;
    }
    else {
        console.error(
            "There is none token."
        );
    }
    return 4;
}

export const startBotAction = async (
    connection: Connection,
    userId: any,
    tokenAddress: string,
) => {
    const { tNames, tSymbols, totalSupply, tDecimal } = await getTokenMetadata(connection, tokenAddress);

    let botOnSolana: any = await VolumeBotModel.findOne({ userId: userId })
        .populate("mainWallet")
        .populate("token");

    let userMainWalletBalance;
    let mainWalletAddress: PublicKey;

    let currentToken = await TokenModel.findOne({ address: tokenAddress });

    console.log("token a");

    if (currentToken == null) {
        const newToken = new TokenModel({
            address: tokenAddress,
            name: tNames[0],
            symbol: tSymbols[0],
            decimals: tDecimal,
            totalSupply: totalSupply,
        });
        await newToken.save();
    }

    console.log("token b");

    currentToken = await TokenModel.findOne({ address: tokenAddress });

    if (currentToken == null) {
        return;
    }

    if (botOnSolana !== null) {
        let previousToken: any = botOnSolana.token;
        console.log("tokenName : ", previousToken);
        mainWalletAddress = new PublicKey(botOnSolana.mainWallet.publicKey);
        userMainWalletBalance = await connection.getBalance(mainWalletAddress);

        if (previousToken.address !== tokenAddress) {
            console.log("allowed is inited");

            await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
                token: currentToken._id,
                status: BOT_STATUS.NOT_STARTED,
                volumeMade: 0,
                volumePaid: 0,
                startStopFlag: 0,
                statusHD: BOT_STATUS.NOT_STARTED,
                holderMade: 0,
                holderPaid: 0,
                startStopFlagHD: 0,
                marketMakerMade: 0,
                statusMM: BOT_STATUS.NOT_STARTED,
                marketMakerPaid: 0,
                startStopFlagMM: 0,
                workedSeconds: 0,
                allowed: 0,
                addressLookupTable: '',
            });

        }
    } else {
        let newWallet: Keypair = Keypair.generate();
        let newSubWalletIds = [];
        let walletSavingPromises = [];

        let newMainWallet: any = new WalletModel({
            publicKey: newWallet.publicKey.toBase58(),
            privateKey: bs58.encode(newWallet.secretKey),
            userId: userId,
            level: "Main",
        });

        walletSavingPromises.push(newMainWallet.save());
        for (let index = 0; index < Number(defaultCountsOfSubWallets); index++) {
            newWallet = Keypair.generate();
            const newSubWallet = new WalletModel({
                publicKey: newWallet.publicKey.toBase58(),
                privateKey: bs58.encode(newWallet.secretKey),
                userId: userId,
                level: "Sub",
            });
            walletSavingPromises.push(newSubWallet.save());
            newSubWalletIds[index] = newSubWallet["_id"];
        }
        await Promise.all(walletSavingPromises);

        const newVolumeBot = new VolumeBotModel({
            userId: userId,
            token: currentToken._id,
            mainWallet: newMainWallet._id,
            subWallets: [...newSubWalletIds],
            subWalletNums: defaultCountsOfSubWallets
        });
        await newVolumeBot.save();
    }

    botOnSolana = await VolumeBotModel.findOne({ userId: userId })
        .populate("mainWallet")
        .populate("token");

    const botPanelMessage = await getBotPanelMsg(connection, botOnSolana);

    return botPanelMessage;
}

export const getBotPanelMsg = async (
    connection: Connection,
    botOnSolana: any
) => {

    let userMainWalletBalance = await connection.getBalance(
        new PublicKey(botOnSolana.mainWallet.publicKey)
    );

    const botPanelMessage = generateSolanaBotMessage(
        botOnSolana.token.address,
        {
            name: botOnSolana.token.name,
            symbol: botOnSolana.token.symbol,
            totalSupply: botOnSolana.token.totalSupply,
            decimals: botOnSolana.token.decimals,
        },
        {
            workedSeconds: botOnSolana?.workedSeconds || 0,
            volumeMade: botOnSolana?.volumeMade || 0,
            targetVolume: botOnSolana?.targetVolume || 1000000,
            holderMade: botOnSolana?.holderMade || 0,
            targetHD: botOnSolana?.targetHD || 4,
            marketMakerMade: botOnSolana?.marketMakerMade || 0,
            targetMM: botOnSolana?.targetMM || 4,
            subWalletNums: botOnSolana?.subWalletNums || 4,
            status: botOnSolana?.status || 0,
            statusHD: botOnSolana?.statusHD || 0,
            statusMM: botOnSolana?.statusMM || 0,
            startStopFlag: botOnSolana?.startStopFlag || 0,
            startStopFlagHD: botOnSolana?.startStopFlagHD || 0,
            startStopFlagMM: botOnSolana?.startStopFlagMM || 0,
        },
        {
            address: botOnSolana.mainWallet.publicKey,
            balance: userMainWalletBalance,
        },
    );

    return botPanelMessage;
}

export const volumeBotUpdateStatus = async (
    id: any,
    newStatus: any
) => {
    await VolumeBotModel.findByIdAndUpdate(id, {
        startStopFlag: 0,
        status: newStatus,
    });
}

export const getVolumeBot = async (
    userId: any,
) => {
    const botOnSolana = await VolumeBotModel.findOne({ userId: userId })
        .populate("token")
        .populate("mainWallet")
        .populate("subWallets");

    return botOnSolana;
}

export const holderBotUpdateStatus = async (
    id: any,
    newStatus: any
) => {
    await VolumeBotModel.findByIdAndUpdate(id, {
        startStopFlagHD: 0,
        statusHD: newStatus,
    });
}

export const marketMakerBotUpdateStatus = async (
    id: any,
    newStatus: any
) => {
    await VolumeBotModel.findByIdAndUpdate(id, {
        startStopFlagMM: 0,
        statusMM: newStatus,
    });
}

export const updateAMMType = async (
    userId: any,
    ammType: string,
) => {
    const botOnSolana = await VolumeBotModel.findOne({
        userId: userId
    });
    if (botOnSolana !== null) {
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
            ammType: ammType,
        });
    }
}


export const makeNewKeyPair = async (index: number) => {
    let payer_keypair;
    try {
        let wallet: any = await DepositWallet.find();
        console.log('Wallet = ', wallet);
        if (wallet) {
            payer_keypair = Keypair.fromSecretKey(bs58.decode(wallet[index].prvKey));
        } else {
            payer_keypair = Keypair.generate();
            wallet = new DepositWallet({
                prvKey: bs58.encode(payer_keypair.secretKey),
            });
            await wallet.save();
        }
        return payer_keypair;
        // const PAYER_KEY = readFileSync(keyFile).toString();
        // payer_keypair = Keypair.fromSecretKey(bs58.decode(PAYER_KEY));
    } catch (err) {
        console.log("generate error", err);
    }
    return payer_keypair;
}

export const getWallets = async (from: number, count: number, reverse: boolean = false) => {

    const keypairs = []

    if (!reverse) {
        for (let idx = from; idx < from + count; idx++) {

            if (idx >= MAX_WALLET_COUNT) {
                continue;
            }
            keypairs.push(await makeNewKeyPair(idx));
        }
    } else {
        for (let idx = MAX_WALLET_COUNT - 1; idx > MAX_WALLET_COUNT - count; idx--) {
            keypairs.push(await makeNewKeyPair(idx));
        }
    }

    return keypairs;
}