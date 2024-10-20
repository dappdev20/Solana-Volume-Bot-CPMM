require("require-esm-as-empty-object");

import dotenv from "dotenv";
import BN from "bn.js";
import { BigNumber } from "bignumber.js";
import {
  Keypair,
  Signer,
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  AuthorityType,
  Account,
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";

import {
  Token,
  TokenAmount,
  TxVersion,
  LOOKUP_TABLE_CACHE,
  MAINNET_PROGRAM_ID,
  SPL_ACCOUNT_LAYOUT,
  Liquidity,
  Percent,
  buildSimpleTransaction
} from "@raydium-io/raydium-sdk";

import { Market, MARKET_STATE_LAYOUT_V3 } from "@project-serum/serum";

import bs58 from "bs58";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { ApiV3PoolInfoItem, PoolFetchType, CurveCalculator, Raydium, PoolUtils } from "@raydium-io/raydium-sdk-v2";
import { isValidAmm, isValidClmm, isValidCpmm } from "./sdkv2";

import {
  PROGRAM_ID,
  Metadata
} from "@metaplex-foundation/mpl-token-metadata";

import {
  blockEngineUrl,
  BOT_FEE,
  FEE_WALLET,
  HOLDER_BOT_MIN_HOLD_SOL,
  HOLDER_BOT_TOKEN_HOLDING,
  JITO_BUNDLE_TIP,
  JITO_TIMEOUT,
  jitokeyStr,
  MAKER_BOT_MIN_HOLD_SOL,
  VOLUME_BOT_MAX_PERCENTAGE,
  VOLUME_BOT_MIN_HOLD_SOL,
  VOLUME_BOT_MIN_PERCENTAGE
} from "../bot/const";

import {
  updateAMMType,
} from "../bot/action";
import axios from "axios";
import { AddressLookupTableAccount } from "@solana/web3.js";

dotenv.config();


export const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));

export const getRandomNumber = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export function validateAddress(inputText: string): string {
  // Trim the input to remove spaces at the start and end
  const trimmedInput = inputText.trim();

  // Regular expression for EVM address: Starts with '0x' followed by 40 hexadecimal characters
  const evmPattern = /^0x[a-fA-F0-9]{40}$/;

  // Regular expression for Solana address: 32 to 44 base58 characters
  const solanaPattern =
    /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,44}$/;

  // Check if the trimmed input matches EVM address pattern
  if (evmPattern.test(trimmedInput)) {
    return "EVM Address";
  }
  // Check if the trimmed input matches Solana address pattern
  else if (solanaPattern.test(trimmedInput)) {
    return "Solana Address";
  }
  // If neither pattern matches
  else {
    return "Invalid Address";
  }
}

const getBotFeeInstruction = async (connection: Connection, signer: Keypair) => {

  const feeInstruction = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: new PublicKey(FEE_WALLET),
    lamports: BOT_FEE,
  });

  return feeInstruction;
}

export const makeVersionedTransactions = async (connection: Connection, signer: Keypair, instructions: TransactionInstruction[]) => {
  let latestBlockhash = await connection.getLatestBlockhash();

  instructions.push(await getBotFeeInstruction(connection, signer));

  // Compiles and signs the transaction message with the sender's Keypair.
  const messageV0 = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: instructions,
  }).compileToV0Message();

  const versionedTransaction = new VersionedTransaction(messageV0);
  versionedTransaction.sign([signer]);
  return versionedTransaction;
};

export const makeVersionedTransactionsWithMultiSign = async (
  connection: Connection,
  signer: Keypair[],
  instructions: TransactionInstruction[],
  addressLookupTable: string = ''
) => {
  let latestBlockhash = await connection.getLatestBlockhash();

  instructions.push(await getBotFeeInstruction(connection, signer[0]));

  const addressLookupTableAccountList: AddressLookupTableAccount[] = [];

  if (addressLookupTable != '') {
    const accountInfo = await connection.getAddressLookupTable(new PublicKey(addressLookupTable));

    if (accountInfo.value != null) {
      addressLookupTableAccountList.push(accountInfo.value);
    }
  }

  // Compiles and signs the transaction message with the sender's Keypair.
  const messageV0 = new TransactionMessage({
    payerKey: signer[1].publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: instructions,
  }).compileToV0Message(addressLookupTableAccountList);

  const versionedTransaction = new VersionedTransaction(messageV0);
  versionedTransaction.sign(signer);
  return versionedTransaction;
};

export const getJitoTipAccount = async () => {
  let jitoAuthKey: Keypair = Keypair.fromSecretKey(bs58.decode(jitokeyStr));

  console.log("Bundle initialized");
  const searcher = searcherClient(blockEngineUrl, jitoAuthKey);
  const tipAccounts = await searcher.getTipAccounts();
  const _tipAccount = tipAccounts[tipAccounts.length - 1];

  console.log("Tip Account:", _tipAccount);
  const tipAccount: PublicKey = new PublicKey(_tipAccount);

  return tipAccount;
}

export async function getTipVesionedTransaction(
  connection: Connection,
  ownerPubkey: PublicKey,
  tip: number
) {
  const instruction = await getTipInstruction(ownerPubkey, tip);

  if (!instruction) {
    return null;
  }

  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const messageV0 = new TransactionMessage({
    payerKey: ownerPubkey,
    recentBlockhash: recentBlockhash,
    instructions: [instruction],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

export async function getTipInstruction(
  ownerPubkey: PublicKey,
  tip: number
) {
  try {
    const { data } = await axios.post(`https://${blockEngineUrl}/api/v1/bundles`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTipAccounts",
        params: [],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const tipAddrs = data.result;
    console.log("Adding tip transactions...", tip);

    const tipAccount = new PublicKey(tipAddrs[0]);
    const instruction =
      SystemProgram.transfer({
        fromPubkey: ownerPubkey,
        toPubkey: tipAccount,
        lamports: LAMPORTS_PER_SOL * tip,
      })

    return instruction;
  }
  catch (err) {
    console.log(err);
  }
  return null;
}

export const createAndSendBundleEx = async (connection: Connection, payer: Keypair, bundleTransactions: VersionedTransaction[]) => {
  try {

    const tipTx = await getTipVesionedTransaction(connection, payer.publicKey, JITO_BUNDLE_TIP / LAMPORTS_PER_SOL);

    if (!tipTx) {
      return false;
    }

    tipTx.sign([payer]);

    bundleTransactions.push(tipTx);

    const rawTxns = bundleTransactions.map(item => bs58.encode(item.serialize()));

    const { data: bundleRes } = await axios.post(`https://${blockEngineUrl}/api/v1/bundles`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [
          rawTxns
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!bundleRes) {
      return false;
    }

    const bundleUUID = bundleRes.result;
    console.log("Bundle sent.");
    console.log("Bundle UUID:", bundleUUID);

    return true;

    const res = await checkBundle(bundleUUID);

    return res;
  } catch (error) {
    console.error("Error creating and sending bundle.", error);

  }
  return false;
};

export const createAndSendBundle = async (connection: Connection, payer: Keypair, bundleTransactions: any) => {
  try {

    let jitoAuthKey: Keypair = Keypair.fromSecretKey(bs58.decode(jitokeyStr));

    console.log("Bundle initialized");
    const searcher = searcherClient(blockEngineUrl, jitoAuthKey);
    const _tipAccount = (await searcher.getTipAccounts())[0];

    console.log("Tip Account:", _tipAccount);
    const tipAccount: PublicKey = new PublicKey(_tipAccount);

    const recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

    let bundle: Bundle | Error = new Bundle(bundleTransactions, 5);
    bundle = bundle.addTipTx(
      payer,
      JITO_BUNDLE_TIP,
      tipAccount,
      recentBlockhash
    );

    console.log("Sending bundle...");
    let bundleUUID;
    if (bundle instanceof Bundle) {
      bundleUUID = await searcher.sendBundle(bundle);
    } else {
      return false;
    }

    console.log("Bundle sent.");
    console.log("Bundle UUID:", bundleUUID);

    const res = await checkBundle(bundleUUID);

    return res;
  } catch (error) {
    console.error("Error creating and sending bundle.", error);
  }

  return false;
};

export const getPoolInfo = async (
  connection: Connection,
  quoteToken: Token,
  baseToken: Token,
  raydium: Raydium | undefined,
  userId: any
) => {
  console.log("Getting pool info...");

  if (raydium == undefined) {
    return null;
  }

  try {
    if (!quoteToken) {
      console.log("Invalid token address");
      return null;
    }

    const data = await raydium.api.fetchPoolByMints({
      mint1: baseToken.mint,
      mint2: quoteToken.mint,
      type: PoolFetchType.Standard
    }) as any;

    const poolNum = data.data.length;
    let i = 0;
    let poolType = '';
    for(i = 0; i < poolNum; i ++) {
      if (isValidCpmm(data.data[i].programId)) {
        poolType = 'cpmm';
        break;
      } else if (isValidAmm(data.data[i].programId)) {
        poolType = 'amm';
        break;
      } else if (isValidClmm(data.data[i].programId)) {
        poolType = 'clmm';
        break;
      }
    }
    console.log("Pool Type = ", poolType, "Pool Num = ", data.data.length);

    updateAMMType(userId, poolType);
    return data.data[i];
  } catch {
    console.log("Getting poolKeys Unknown Error.");
    return null;
  }
};

export const collectSol = async (connection: Connection, targetWallet: PublicKey, mainWallet: Keypair, subWallets: Keypair[]) => {

  console.log("Collecting all SOL...");
  const txFee = VOLUME_BOT_MIN_HOLD_SOL * LAMPORTS_PER_SOL;

  try {

    console.log("targetAddress : ", targetWallet.toBase58());
    const instructions = [];

    const balance = await connection.getBalance(mainWallet.publicKey);

    if (balance > txFee && targetWallet.toString() != mainWallet.publicKey.toString()) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: targetWallet,
          lamports: Number(balance - txFee),
        })
      );
    }

    if (instructions.length > 0) {
      const versionedTx = await makeVersionedTransactionsWithMultiSign(connection, [mainWallet, mainWallet], instructions);
      const ret = await createAndSendBundle(connection, mainWallet, [versionedTx]);
      if (ret) {
        console.log("Collect Done");
        return 0;
      } else {
        console.log("Collecting failed.");
        return 2;
      }
    } else {
      console.log("No sol to collect");
      return 1;
    }
  } catch (err) {
    console.log(err);
    return 2;
  }
};

export const sellToken = async (
  connection: Connection,
  seller: Keypair,
  tokenAmount: any,
  quoteToken: Token,
  baseToken: Token,
  poolInfo: any,
  raydium: Raydium | undefined,
) => {
  const { instructions, minOut } = await sellTokenInstruction(connection, seller, tokenAmount, quoteToken, baseToken, poolInfo, raydium);

  if (instructions.length == 0) {
    return null;
  }

  const versionTx = await makeVersionedTransactions(connection, seller, instructions);
  versionTx.sign([seller]);

  return { transaction: versionTx, minOut: minOut };
};

export const buyToken = async (
  connection: Connection,
  buyer: Keypair,
  solAmount: number,
  quoteToken: Token,
  baseToken: Token,
  poolInfo: ApiV3PoolInfoItem,
  raydium: Raydium | undefined
) => {
  const { instructions, minOut } = await buyTokenInstruction(connection, buyer, solAmount, quoteToken, baseToken, poolInfo, raydium);

  console.log("buyToken minOut", minOut);

  if (instructions.length == 0) {
    return { transaction: null, minOut: 0 };
  }

  const versionTx = await makeVersionedTransactions(connection, buyer, instructions);
  versionTx.sign([buyer]);

  const simRes = await connection.simulateTransaction(versionTx);

  // console.log("sim res", simRes);

  return { transaction: versionTx, minOut: minOut };
};

export const sellTokenInstruction = async (
  connection: Connection,
  seller: Keypair,
  tokenAmount: any,
  quoteToken: Token,
  baseToken: Token,
  poolInfo: any,
  raydium: Raydium | undefined,
) => {
  let poolType = '';

  if (raydium == undefined) {
    return { instructions: [], minOut: 0 };
  }

  if (isValidCpmm(poolInfo.programId)) {
    poolType = 'cpmm';
  } else if (isValidAmm(poolInfo.programId)) {
    poolType = 'amm';
  } else if (isValidClmm(poolInfo.programId)) {
    poolType = 'clmm';
  }

  if (!poolType || poolType.length == 0) {
    return { instructions: [], minOut: 0 };
  }

  // console.log("buyer", seller.publicKey.toString());
  // console.log("baseToken", baseToken.mint.toString());

  const inputAmount = new BN(tokenAmount);


  if (poolType == 'cpmm') {

    const rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true)

    const inputMint = baseToken.mint.toString();
    const baseIn = inputMint === poolInfo.mintA.address

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo ? rpcData.configInfo.tradeFeeRate : new BN(0),
    )

    // console.log("swapResult", swapResult);

    // console.log(await connection.simulateTransaction(tipTransaction))
    const { transaction } = await raydium.cpmm.swap<TxVersion.LEGACY>({
      payer: seller.publicKey,
      poolInfo: poolInfo as any,
      swapResult: swapResult,
      slippage: 0, // range: 1 ~ 0.0001, means 100% ~ 0.01%
      baseIn,
      txVersion: TxVersion.LEGACY,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   microLamports: 100000,
      // },
    })

    return { instructions: transaction.instructions, minOut: swapResult.destinationAmountSwapped.toNumber() };

  } else if (poolType == 'amm') {

    const poolKeys = await raydium.liquidity.getAmmPoolKeys(poolInfo.id)
    const rpcData = await raydium.liquidity.getRpcPoolInfo(poolInfo.id)

    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

    const inputMint = baseToken.mint.toString()
    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
      throw new Error('input mint does not match pool')

    const baseIn = inputMint === poolInfo.mintA.address
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]

    const amountIn = tokenAmount;
    const out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      } as any,
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: 0.1, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    const { transaction } = await raydium.liquidity.swap({
      poolInfo: poolInfo as any,
      poolKeys,
      amountIn: new BN(amountIn),
      amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
      fixedSide: 'in',
      inputMint: mintIn.address,
      associatedOnly: false,
      // config: {
      //   associatedOnly: false,
      // },
      txVersion: TxVersion.LEGACY,
      // computeBudgetConfig: {
      //   // units: 1000000,
      //   microLamports: 100,
      // }
    })

    return { instructions: transaction.instructions, minOut: out.minAmountOut.toNumber() };
  } else if (poolType == 'clmm') {

    const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
      connection: raydium.connection,
      poolInfo: poolInfo as any,
    })
    const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
      connection: raydium.connection,
      poolKeys: [clmmPoolInfo],
    })

    const inputMint = baseToken.mint.toString();
    const baseIn = inputMint === poolInfo.mintA.address;
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

    const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolInfo.id],
      amountIn: inputAmount,
      tokenOut: mintOut,
      slippage: 0.1,
      epochInfo: await raydium.fetchEpochInfo(),
    })

    const { transaction } = await raydium.clmm.swap({
      poolInfo: poolInfo as any,
      // poolKeys: ,
      inputMint: poolInfo[baseIn ? 'mintA' : 'mintB'].address,
      amountIn: inputAmount,
      amountOutMin: minAmountOut.amount.raw,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true, // if wish to use existed wsol token account, pass false
      },
      remainingAccounts,
      txVersion: TxVersion.LEGACY,
    })

    return { instructions: transaction.instructions, minOut: minAmountOut.amount.raw.toNumber() };

  }

  return { instructions: [], minOut: 0 };
};

export const buyTokenInstruction = async (
  connection: Connection,
  buyer: Keypair,
  solAmount: number,
  quoteToken: Token,
  baseToken: Token,
  poolInfo: ApiV3PoolInfoItem,
  raydium: Raydium | undefined
) => {

  let poolType = '';

  if (raydium == undefined) {
    console.log("!!!");
    return { instructions: [], minOut: 0 };
  }

  if (isValidCpmm(poolInfo.programId)) {
    poolType = 'cpmm';
  } else if (isValidAmm(poolInfo.programId)) {
    poolType = 'amm';
  } else if (isValidClmm(poolInfo.programId)) {
    poolType = 'clmm';
  }

  if (!poolType || poolType.length == 0) {
    return { instructions: [], minOut: 0 };
  }

  const inputAmount = new BN(Math.floor(solAmount));

  // console.log("buyer", buyer.publicKey.toString());
  // console.log("baseToken", baseToken.mint.toString());
  // console.log("solAmount", inputAmount.toString());

  if (poolType == 'cpmm') {

    const rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true);

    const inputMint = baseToken.mint.toString();
    const baseIn = inputMint === poolInfo.mintB.address;

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo ? rpcData.configInfo.tradeFeeRate : new BN(0),
    )

    // console.log("swapResult", swapResult);

    // console.log(await connection.simulateTransaction(tipTransaction))
    const { transaction } = await raydium.cpmm.swap<TxVersion.LEGACY>({
      payer: buyer.publicKey,
      poolInfo: poolInfo as any,
      swapResult: swapResult,
      slippage: 0.005, // range: 1 ~ 0.0001, means 100% ~ 0.01%
      baseIn,
      txVersion: TxVersion.LEGACY,
      // optional: set up priority fee here
      // computeBudgetConfig: {
      //   microLamports: 100000,
      // },
    })

    return { instructions: transaction.instructions, minOut: swapResult.destinationAmountSwapped.toNumber() };

  } else if (poolType == 'amm') {

    const poolKeys = await raydium.liquidity.getAmmPoolKeys(poolInfo.id)
    const rpcData = await raydium.liquidity.getRpcPoolInfo(poolInfo.id)

    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

    const inputMint = baseToken.mint.toString()
    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
      throw new Error('input mint does not match pool')

    const baseIn = inputMint === poolInfo.mintB.address;
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

    const out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      } as any,
      amountIn: inputAmount,
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: 0.1, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    const { transaction } = await raydium.liquidity.swap({
      poolInfo: poolInfo as any,
      poolKeys,
      amountIn: inputAmount,
      amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
      fixedSide: 'in',
      inputMint: mintIn.address,
      associatedOnly: false,
      // config: {
      //   associatedOnly: false,
      // },
      txVersion: TxVersion.LEGACY,
      // computeBudgetConfig: {
      //   // units: 1000000,
      //   microLamports: 100,
      // }
    })

    return { instructions: transaction.instructions, minOut: out.minAmountOut.toNumber() };
  } else if (poolType == 'clmm') {

    const clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
      connection: raydium.connection,
      poolInfo: poolInfo as any,
    })
    const tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
      connection: raydium.connection,
      poolKeys: [clmmPoolInfo],
    })

    const inputMint = baseToken.mint.toString();
    const baseIn = inputMint === poolInfo.mintA.address;
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

    const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache: tickCache[poolInfo.id],
      amountIn: inputAmount,
      tokenOut: mintOut,
      slippage: 0.1,
      epochInfo: await raydium.fetchEpochInfo(),
    })

    const { transaction } = await raydium.clmm.swap({
      poolInfo: poolInfo as any,
      // poolKeys: ,
      inputMint: poolInfo[baseIn ? 'mintA' : 'mintB'].address,
      amountIn: inputAmount,
      amountOutMin: minAmountOut.amount.raw,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true, // if wish to use existed wsol token account, pass false
      },
      remainingAccounts,
      txVersion: TxVersion.LEGACY,
    })

    return { instructions: transaction.instructions, minOut: minAmountOut.amount.raw.toNumber() };
  }

  return { instructions: [], minOut: 0 };
};

export const getTokenPrice = async (
  connection: Connection,
  buyer: Keypair,
  solAmount: number,
  quoteToken: Token,
  baseToken: Token,
  poolInfo: ApiV3PoolInfoItem,
  raydium: Raydium
) => {

  let poolType = '';

  if (isValidCpmm(poolInfo.programId)) {
    poolType = 'cpmm';
  }
  if (isValidAmm(poolInfo.programId)) {
    poolType = 'amm'
  }

  if (!poolType || poolType.length == 0) throw new Error('target pool is not detectable')

  if (poolType == 'cpmm') {

    const rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true)

    const inputAmount = new BN(solAmount * LAMPORTS_PER_SOL);
    const inputMint = baseToken.mint.toString();
    const baseIn = inputMint === poolInfo.mintA.address

    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo ? rpcData.configInfo.tradeFeeRate : new BN(0),
    )

    return swapResult.destinationAmountSwapped.toNumber() / swapResult.sourceAmountSwapped.toNumber();

  } else if (poolType == 'amm') {
    const rpcData = await raydium.liquidity.getRpcPoolInfo(poolInfo.id)

    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

    const inputMint = baseToken.mint.toString()
    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
      throw new Error('input mint does not match pool')

    const baseIn = inputMint === poolInfo.mintA.address
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]

    const amountIn = solAmount * LAMPORTS_PER_SOL;
    const out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      } as any,
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: 0.1, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    return out.currentPrice.toNumber();
  }
};


export async function updateRecentBlockHash(connection: Connection, transactions: VersionedTransaction[]) {

  const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  console.log("recentBlockhash", recentBlockhash);

  for (const transaction of transactions) {
    transaction.message.recentBlockhash = recentBlockhash;
  }
}

export const createTokenAccountTx = async (
  connection: Connection,
  mainWallet: Keypair,
  mint: PublicKey,
  poolInfo: any,
  raydium: Raydium | undefined,
) => {

  if (raydium == undefined) {
    return null;
  }

  const instructions = [];
  let idx = 0;

  const associatedToken = getAssociatedTokenAddressSync(
    mint,
    mainWallet.publicKey
  );

  const info = await connection.getAccountInfo(associatedToken);

  if (!info) {
    console.log("*********** creating ATA...", idx);
    instructions.push(
      createAssociatedTokenAccountInstruction(
        mainWallet.publicKey,
        associatedToken,
        mainWallet.publicKey,
        mint
      )
    );
  }

  console.log("*********** creating addressLookupTable...", idx);

  let poolType = '', poolKeys;
  const addressList = [];

  if (isValidCpmm(poolInfo.programId)) {
    poolType = 'cpmm';
  } else if (isValidAmm(poolInfo.programId)) {
    poolType = 'amm';
  } else if (isValidClmm(poolInfo.programId)) {
    poolType = 'clmm';
  }

  if (poolType == 'cpmm') {
    poolKeys = await raydium.cpmm.getCpmmPoolKeys(poolInfo.id);

    addressList.push(poolKeys.authority);
    addressList.push(poolKeys.id);
    addressList.push(poolKeys.mintA.address);
    addressList.push(poolKeys.mintA.programId);
    addressList.push(poolKeys.mintB.address);
    addressList.push(poolKeys.mintB.programId);
    addressList.push(poolKeys.mintLp.address);
    addressList.push(poolKeys.mintLp.programId);
    addressList.push(poolKeys.programId);
    addressList.push(poolKeys.vault.A);
    addressList.push(poolKeys.vault.B);

  } else if (poolType == 'clmm') {
    poolKeys = await raydium.clmm.getClmmPoolKeys(poolInfo.id);

    addressList.push(poolKeys.id);
    addressList.push(poolKeys.mintA.address);
    addressList.push(poolKeys.mintA.programId);
    addressList.push(poolKeys.mintB.address);
    addressList.push(poolKeys.mintB.programId);
    addressList.push(poolKeys.programId);
    addressList.push(poolKeys.vault.A);
    addressList.push(poolKeys.vault.B);

  } else {
    poolKeys = await raydium.liquidity.getAmmPoolKeys(poolInfo.id);

    addressList.push(poolKeys.programId);
    addressList.push(poolKeys.id);
    addressList.push(poolKeys.mintA.address);
    addressList.push(poolKeys.mintA.programId);
    addressList.push(poolKeys.mintB.address);
    addressList.push(poolKeys.mintB.programId);
    addressList.push(poolKeys.vault.A);
    addressList.push(poolKeys.vault.B);
    addressList.push(poolKeys.authority);
    addressList.push(poolKeys.openOrders);
    addressList.push(poolKeys.targetOrders);
    addressList.push(poolKeys.mintLp.address);
    addressList.push(poolKeys.mintLp.programId);
    addressList.push(poolKeys.marketProgramId);
    addressList.push(poolKeys.marketId);
    addressList.push(poolKeys.marketAuthority);
    addressList.push(poolKeys.marketBaseVault);
    addressList.push(poolKeys.marketQuoteVault);
    addressList.push(poolKeys.marketBids);
    addressList.push(poolKeys.marketAsks);
    addressList.push(poolKeys.marketEventQueue);
  }

  console.log("here", poolKeys);

  const slot = await connection.getSlot();

  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: mainWallet.publicKey,
      payer: mainWallet.publicKey,
      recentSlot: slot,
    });

  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: mainWallet.publicKey,
    authority: mainWallet.publicKey,
    lookupTable: lookupTableAddress,
    addresses: addressList.map(item => new PublicKey(item)),
  });

  instructions.push(lookupTableInst);
  instructions.push(extendInstruction);

  const tx = await makeVersionedTransactions(connection, mainWallet, instructions);

  await createAndSendBundle(connection, mainWallet, [tx]);

  return lookupTableAddress;
}

export const collectSolFromSub = async (
  connection: Connection,
  mainWallet: Keypair,
  subWallets: Keypair[],
  returnSolArr: number[]
) => {
  const instructions = [];
  let idx = 0;

  for (idx = 0; idx < subWallets.length; idx++) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: subWallets[idx].publicKey,
        toPubkey: mainWallet.publicKey,
        lamports: returnSolArr[idx]
      })
    );
  }

  return await makeVersionedTransactionsWithMultiSign(connection, subWallets, instructions);
}

export const makeBuySellTransaction = async (
  connection: Connection,
  payer: Keypair,
  buyer: Keypair,
  solAmount: number,
  quoteToken: Token,
  baseToken: Token,
  baseDecimal: number,
  poolInfo: any,
  raydium: Raydium | undefined,
  clean: boolean,
  addressLookupTable: string,
) => {

  if (raydium == undefined) {
    return null;
  }

  // console.log("solAmount : ", solAmount);
  console.log("maker : ", payer.publicKey.toString());
  let versionedTransactions = [];

  try {
    // console.log("raydium.owner", raydium.owner?.publicKey.toString());

    // buy
    const { instructions, minOut } = await buyTokenInstruction(connection, buyer, solAmount, quoteToken, baseToken, poolInfo, raydium);
    versionedTransactions.push(...instructions);

    const tokenBalance = await getTokenBalance(connection, baseToken.mint.toString(), buyer.publicKey, baseDecimal);

    //sell
    let tokenAmountToSell = clean ? minOut + tokenBalance * 10 ** baseDecimal : minOut;
    console.log("minAmountOut : ", Number(tokenAmountToSell));

    const { instructions: sellInstrunctions } = await sellTokenInstruction(connection, buyer, tokenAmountToSell, quoteToken, baseToken, poolInfo, raydium);
    // console.log("instructions", res.instructions);

    versionedTransactions.push(...sellInstrunctions);

  } catch (error) {
    console.log("ERROR: Make buy and sell transaction error.", error);
    return null;
  }

  const tx = await makeVersionedTransactionsWithMultiSign(connection, [buyer, payer], versionedTransactions, addressLookupTable);
  return tx;
};

export const getTokenMetadata = async (
  connection: Connection,
  tokenAddress: string,
) => {

  const mint = new PublicKey(tokenAddress);
  const mintInfo = await getMint(connection, mint);

  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), PROGRAM_ID.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );

  const metadata = await Metadata.fromAccountAddress(
    connection,
    metadataPDA
  );
  console.log(metadata.data.name);
  const tNames = metadata.data.name.split("\0");
  const tSymbols = metadata.data.symbol.split("\0");
  const totalSupply = Number(new BigNumber(mintInfo.supply.toString() + "e-" + mintInfo.decimals.toString()).toString()).toFixed(0);

  return { tNames, tSymbols, totalSupply, tDecimal: mintInfo.decimals };
}

export const getTokenBalance = async (
  connection: Connection,
  tokenAddress: string,
  walletAddress: PublicKey,
  tokenDecimal: number = 9,
) => {
  const associatedToken = getAssociatedTokenAddressSync(
    new PublicKey(tokenAddress),
    walletAddress
  );
  if (!associatedToken)
    return 0;

  let tokenAccountInfo = null;
  let tokenBalance: BN = new BN("0");
  try {
    tokenAccountInfo = await getAccount(connection, associatedToken);
    tokenBalance = new BN(
      new BigNumber(tokenAccountInfo.amount.toString() + "e-" + tokenDecimal).toFixed(0, 1));
  } catch (err) {
    console.log("Token account is none.")
    return 0;
  }

  return tokenBalance.toNumber();
}

const checkBundle = async (uuid: any) => {

  let count = 0;
  while (1) {
    try {
      const response = await (
        await fetch(`https://${blockEngineUrl}/api/v1/bundles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBundleStatuses',
            params: [[uuid]]
          })
        })
      ).json();

      console.log("response", response.result.value.length);
      console.log("bundle_id", response.result.value[0].bundle_id);

      if (response?.result?.value?.length == 1 && response?.result?.value[0]?.bundle_id) {
        console.log('Bundle Success:', uuid);
        return true;
      }

    } catch (error) {
      console.log('Check Bundle Failed', error);
    }

    await sleep(1000);
    count++;

    if (count == 30) {
      console.log('Bundle Failed:', uuid);
      return false;
    }
  }
  return false;

}
