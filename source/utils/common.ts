require("require-esm-as-empty-object");

import dotenv from "dotenv";
import BN from "bn.js";
import { BigNumber } from "bignumber.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

import {
  Token,
  TxVersion,
} from "@raydium-io/raydium-sdk";

import bs58 from "bs58";
import { ApiV3PoolInfoItem, PoolFetchType, CurveCalculator, Raydium, PoolUtils } from "@raydium-io/raydium-sdk-v2";
import { isValidAmm, isValidClmm, isValidCpmm } from "./sdkv2";

import {
  PROGRAM_ID,
  Metadata
} from "@metaplex-foundation/mpl-token-metadata";

import {
  blockEngineUrl,
  BOT_FEE,
  REFERRAL_FEE_PERCENT,
  FEE_WALLET,
  TAX_AMOUNT,
  JITO_BUNDLE_TIP,
  VOLUME_BOT_MIN_HOLD_SOL,
} from "../bot/const";

import {
  updateAMMType,
} from "../bot/action";
import axios from "axios";
import { AddressLookupTableAccount } from "@solana/web3.js";
import base58 from 'bs58';

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

const getBotFeeInstruction = async (connection: Connection, signer: Keypair, referral: Keypair, coupon: number) => {

  let feeInstruction1, feeInstruction2;
  let tax = BOT_FEE;
  let taxMain = tax * 0.8;
  let taxReferral = tax * 0.2;
  if (coupon == 0) {
    return [];
  } else if (coupon > 0) {
    tax = tax * coupon / 100;
  }
  if (referral) {
    taxMain = tax * 0.8;
    taxReferral = tax * 0.2;
    feeInstruction1 = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: new PublicKey(FEE_WALLET),
      lamports: taxMain,
    });
    feeInstruction2 = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: referral.publicKey,
      lamports: taxReferral,
    });
    return [feeInstruction1, feeInstruction2];
  } else {
    feeInstruction1 = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: new PublicKey(FEE_WALLET),
      lamports: tax,
    });
    return [feeInstruction1];
  }

  return [feeInstruction1];
}

export const makeVersionedTransactions = async (connection: Connection, signer: Keypair, instructions: TransactionInstruction[]) => {
  let latestBlockhash = await connection.getLatestBlockhash();

  // let feeInstruction: any = await getBotFeeInstruction(connection, signer, referral, coupon);
  // instructions.push(feeInstruction);

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

export const getJitoTipAccount = () => {
	const tipAccounts = [
		'96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
		'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
		'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
		'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
		'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
		'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
		'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
		'3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
	];
	// Randomly select one of the tip addresses
	const selectedTipAccount = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
	return new PublicKey(selectedTipAccount);
};

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
    console.log("Adding tip transactions...", tip);

    const tipAccount = await getJitoTipAccount();
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
      mint1: quoteToken.mint,
      mint2: baseToken.mint,
      type: PoolFetchType.All
    }) as any;

    console.log(data);

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

export const catchTax = async (connection: Connection, targetWallet: PublicKey, mainWallet: Keypair, referralWallet: Keypair, coupon: number) => {

  console.log("Sending 0.5 SOL to Fee Wallet...");
  if (coupon == 0)
    return true;

  const tax = TAX_AMOUNT * LAMPORTS_PER_SOL * coupon / 100;
  let taxMain: number = tax;
  let taxReferral: number = 0; 

  try {
    if (referralWallet) {
      taxMain = tax * (100 - REFERRAL_FEE_PERCENT) / 100;
      taxReferral = tax - taxMain;
    }
    console.log("catchtax01...");
    console.log("targetAddress : ", targetWallet.toBase58());
    console.log("catchtax02...");
    let instructions = [];

    if (referralWallet) {
      console.log('Referral Wallet...', referralWallet.publicKey);
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: targetWallet,
          lamports: taxMain,
        })
      );
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: referralWallet.publicKey,
          lamports: taxReferral,
        })
      );
    } else {
      console.log('No Referral Wallet...');
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: targetWallet,
          lamports: tax,
        })
      );
    }
    console.log("catchtax...");
    if (instructions.length > 0) {
      const versionedTx = await makeVersionedTransactions(connection, mainWallet, instructions);
      const ret = await createAndSendBundleEx(connection, mainWallet, [versionedTx]);
      if (ret) {
        console.log("✅ Tax Transaction Success");
        return true;
      } else {
        console.log("❌ Tax Transaction Failed.");
        return false;
      }
    } else {
      console.log("❌ Tax Transaction Failed");
      return false;
    }
    
  } catch (err) {
    console.log(err);
    return false;
  }
};

export const collectSol = async (connection: Connection, targetWallet: PublicKey, mainWallet: Keypair) => {

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
      const ret = await createAndSendBundleEx(connection, mainWallet, [versionedTx]);
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

  // const simRes = await connection.simulateTransaction(versionTx);
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

    const { transaction } = await raydium.cpmm.swap<TxVersion.LEGACY>({
      payer: buyer.publicKey,
      poolInfo: poolInfo as any,
      swapResult: swapResult,
      slippage: 0.005, // range: 1 ~ 0.0001, means 100% ~ 0.01%
      baseIn,
      txVersion: TxVersion.LEGACY,
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
      txVersion: TxVersion.LEGACY,
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

export async function getTokenData(tokenAddress: string) {
  try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const tokenData = response.data;
      // console.log(tokenData);
      if (tokenData.pairs === null)
          return { result: false, data: [] };
      const pairItem = tokenData.pairs.find((item: { quoteToken: { address: string; }; }) => item.quoteToken.address === 'So11111111111111111111111111111111111111112');
      const dexId = pairItem.dexId;
      if (dexId !== 'raydium')
          return { result: false, data: [] };
      // console.log('Token Data:', tokenData);
      return { result: true, data: pairItem };
  }
  catch (error) {
      console.error('Error fetching token data:', error);
      return { result: false, data: [] };
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

  await createAndSendBundleEx(connection, mainWallet, [tx]);

  return lookupTableAddress;
}

export const collectSolFromSub = async (
  connection: Connection,
  mainWallet: Keypair,
  subWallets: Keypair[],
) => {
  const instructions = [];
  let idx = 0;
  let collectInst: any = [];
  for (idx = 0; idx < subWallets.length; idx++) {
    let solBalance = await connection.getBalance(
      new PublicKey(subWallets[idx].publicKey)
    );
    collectInst.push(solBalance);
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: subWallets[idx].publicKey,
        toPubkey: mainWallet.publicKey,
        lamports: collectInst[idx]
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

  console.log("maker : ", payer.publicKey.toString(), 'solAmount = ', solAmount);
  let versionedTransactions = [];

  try {
    // buy
    const { instructions, minOut } = await buyTokenInstruction(connection, buyer, solAmount, quoteToken, baseToken, poolInfo, raydium);
    versionedTransactions.push(...instructions);

    const tokenBalance = await getTokenBalance(connection, baseToken.mint.toString(), buyer.publicKey, baseDecimal);

    //sell
    let tokenAmountToSell = clean ? minOut + tokenBalance * 10 ** baseDecimal : minOut;
    console.log("minAmountOut : ", Number(tokenAmountToSell));

    const { instructions: sellInstrunctions } = await sellTokenInstruction(connection, buyer, tokenAmountToSell, quoteToken, baseToken, poolInfo, raydium);
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

export function getWalletFromPrivateKey(privateKey: string): any | null {

  try {
      const key: Uint8Array = base58.decode(privateKey)
      const keypair: Keypair = Keypair.fromSecretKey(key);

      const publicKey = keypair.publicKey.toBase58()
      const secretKey = base58.encode(keypair.secretKey)

      return { publicKey, secretKey, wallet: keypair }
  } catch (error) {
      return null;
  }
}

export const get_jito_block_api = () => {
  return blockEngineUrl as string
}
