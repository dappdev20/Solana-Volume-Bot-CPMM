import dotenv from "dotenv";
import { Token, TOKEN_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

dotenv.config();

export const networkName = process.env.SOLANA_RPC_URL || "mainnet";
console.log("RPC:", networkName);

export const connection = new Connection(networkName, "finalized");
export const web3Conn: Connection = new Connection(networkName, "processed");

export const raydiumSDKList = new Map<string, Raydium>();

export const FEE_WALLET = process.env.BOT_FEE_WALLET ? process.env.BOT_FEE_WALLET : '3Qdx5ybMHxksJtYERhXGwWLzhRREfEYjshggvB69MbXC';

export const volumeMakerInterval = process.env.VOLUME_MAKER_INTERVAL_SPAN || 30;

export const VOLUME_BOT_MIN_PERCENTAGE = process.env.VOLUME_BOT_MIN_PERCENTAGE ? parseFloat(process.env.VOLUME_BOT_MIN_PERCENTAGE) : 0.8;
export const VOLUME_BOT_MAX_PERCENTAGE = process.env.VOLUME_BOT_MAX_PERCENTAGE ? parseFloat(process.env.VOLUME_BOT_MAX_PERCENTAGE) : 0.9;

export const MAX_WALLET_COUNT = process.env.MAX_WALLET_COUNT ? parseInt(process.env.MAX_WALLET_COUNT) : 10000;
export const HOLDER_BOT_TOKEN_HOLDING = process.env.HOLDER_BOT_TOKEN_HOLDING ? parseInt(process.env.HOLDER_BOT_TOKEN_HOLDING) : 11;
export const HOLDER_BOT_MAX_PER_TX = process.env.HOLDER_BOT_MAX_PER_TX ? parseInt(process.env.HOLDER_BOT_MAX_PER_TX) : 5;
export const HOLDER_BOT_MIN_HOLD_SOL = 0.003;
export const MAKER_BOT_MAX_PER_TX = process.env.MAKER_BOT_MAX_PER_TX ? parseInt(process.env.MAKER_BOT_MAX_PER_TX) : 4;
export const MAKER_BOT_MIN_HOLD_SOL = 0.005;
export const VOLUME_BOT_MIN_HOLD_SOL = process.env.VOLUME_BOT_MIN_HOLD_SOL ? parseFloat(process.env.VOLUME_BOT_MIN_HOLD_SOL) : 0.001;

export const BOT_FEE = process.env.BOT_FEE ? parseFloat(process.env.BOT_FEE) * LAMPORTS_PER_SOL : 1000000;
export const REFERRAL_FEE_PERCENT = 20;
export const TAX_AMOUNT = 1.5;

export const blockEngineUrl: any = process.env.BLOCK_ENGINE_URL;
export const JITO_BUNDLE_TIP: number = process.env.JITO_BUNDLE_TIP ? parseFloat(process.env.JITO_BUNDLE_TIP) * LAMPORTS_PER_SOL : 10000;
export const token = process.env.BOT_TOKEN;
export const JITO_TIMEOUT = 30;


export const splStartStopNotifies = new Set<number>();
export const volumeAmountNotifies = new Set<number>();
export const distributeSolNotifies = new Set<number>();
export const mmAmountNotifies = new Set<number>();
export const buyAmountNotifies = new Set<number>();
export const withdrawAmountNotifies = new Set<number>();
export const hdAmountNotifies = new Set<number>();
export const collectSolNotifies = new Set<number>();
export const pendingCollectSol = new Set<number>();
export const pendingTokenBuy = new Set<number>();

export const holderBots = new Map<any, boolean>();
export const makerBots = new Map<any, boolean>();
export const volumeBots = new Map<any, boolean>();

export const BOT_STATUS = {
    NOT_STARTED: 0,
    ARCHIVED_TARGET_VOLUME: 1,
    RUNNING: 2,
    STOPPED_BY_USER: 3,
    STOPPED_DUE_TO_MAIN_WALLET_BALANCE: 4,
    STOPPED_DUE_TO_SUB_WALLETS_BALANCE: 5,
    STOPPED_DUE_TO_OTHER_ERROR: 6,
    STOPPED_DUE_TO_SIMULATION_ERROR: 7,
};

export const quoteToken = new Token(
    TOKEN_PROGRAM_ID,
    "So11111111111111111111111111111111111111112",
    9,
    "WSOL",
    "WSOL"
);

export const SERVICE_TOKEN = 'ABL6kLtd8TiNcteGithHveFaTvxiuf7fuKph6uAkXV8o';

export const resetNotifies = (id: any) => {
    volumeAmountNotifies.delete(id);
    distributeSolNotifies.delete(id);
    hdAmountNotifies.delete(id);
    mmAmountNotifies.delete(id);
    splStartStopNotifies.delete(id);
    collectSolNotifies.delete(id);
    buyAmountNotifies.delete(id);
    withdrawAmountNotifies.delete(id);
}