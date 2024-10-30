require("require-esm-as-empty-object");

import { FileAdapter } from "@grammyjs/storage-file";
import dotenv from "dotenv";
import { Bot, session } from "grammy";
import { Menu } from "@grammyjs/menu";
import { generateUpdateMiddleware } from "telegraf-middleware-console-time";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { Token } from "@raydium-io/raydium-sdk";

import bs58 from "bs58";
import BN from "bn.js";
import type { MyContext, Session } from "./my-context";
import { connectDatabase } from "../database/config";
import {
  getPoolInfo,
  makeBuySellTransaction,
  createAndSendBundle,
  validateAddress,
  collectSol,
  getTokenMetadata,
  getTokenBalance,
  updateRecentBlockHash,
  buyToken,
  createTokenAccountTx,
  collectSolFromSub,
  makeVersionedTransactions,
  getJitoTipAccount,
  createAndSendBundleEx,
} from "../utils/common";

import VolumeBotModel from "../database/models/volumebot.model";
import WalletModel from "../database/models/wallet.model";
import ParentDatabase from "../database/engine/parent_db";

import { generateSolanaBotMessage } from "../utils/generateBotPanel";
import { setIntervalAsync } from "set-interval-async/dynamic";
import { initSdk } from "../utils/sdkv2";

import {
  getBotPanelMsg,
  getVolumeBot,
  getWallets,
  holderBotUpdateStatus,
  makeNewKeyPair,
  marketMakerBotUpdateStatus,
  startBotAction,
  updateMarketMaker,
  updateTargetHolder,
  updateTargetVolume,
  volumeBotUpdateStatus,
  sellAllAction,
  withdraw,
} from "./action";

import {
  BOT_STATUS,
  collectSolNotifies,
  connection,
  FEE_WALLET,
  hdAmountNotifies,
  HOLDER_BOT_MAX_PER_TX,
  HOLDER_BOT_TOKEN_HOLDING,
  MAX_WALLET_COUNT,
  mmAmountNotifies,
  buyAmountNotifies,
  withdrawAmountNotifies,
  pendingCollectSol,
  pendingTokenBuy,
  quoteToken,
  raydiumSDKList,
  resetNotifies,
  splStartStopNotifies,
  token,
  VOLUME_BOT_MAX_PERCENTAGE,
  VOLUME_BOT_MIN_PERCENTAGE,
  volumeAmountNotifies,
  volumeMakerInterval,
  VOLUME_BOT_MIN_HOLD_SOL,
  MAKER_BOT_MAX_PER_TX,
  holderBots,
  makerBots,
  volumeBots,
  HOLDER_BOT_MIN_HOLD_SOL,
  MAKER_BOT_MIN_HOLD_SOL,
} from "./const";
import { SystemProgram } from "@solana/web3.js";

import DepositWallet from "../database/models/depositWallet.model";

dotenv.config();

const pdatabase = ParentDatabase();

let parentCtx: any;
console.log("bot-Token : ", token);

if (!token) {
  throw new Error(
    "You have to provide the bot-token from @BotFather via environment variable (BOT_TOKEN)"
  );
}

const bot = new Bot<MyContext>(token);

// connectDatabase(() => {});

const addRaydiumSDK = async (publicKey: PublicKey) => {
  const raydium = raydiumSDKList.get(publicKey.toString());

  if (raydium) {
    return;
  }

  const newRaydium = await initSdk(connection);

  newRaydium.setOwner(publicKey);

  raydiumSDKList.set(publicKey.toString(), newRaydium);
};

async function initSDKs() {
  const startedBots = await VolumeBotModel.find()
    .populate("mainWallet")
    .populate("subWallets")
    .populate("token");

  if (!startedBots || startedBots.length == 0) {
    return;
  }

  for (let index = 0; index < startedBots.length; index++) {
    const botOnSolana: any = startedBots[index];

    const subWalletNums = botOnSolana?.subWalletNums || 4;
    let subWallets: any = [];

    for (let index = 0; index < subWalletNums; index++) {
      subWallets[index] = Keypair.fromSecretKey(
        bs58.decode(botOnSolana.subWallets[index]["privateKey"])
      );

      await addRaydiumSDK(subWallets[index].publicKey);
    }

    const mainWallet: Keypair = Keypair.fromSecretKey(
      bs58.decode(botOnSolana.mainWallet.privateKey)
    );

    await addRaydiumSDK(mainWallet.publicKey);
  }
}

const ammMenu = new Menu("AMM_menu")
  .text(
    async (ctx: any) => {
      return "AMM";
    },
    async (ctx: any) => {
      console.log("CTX Id = ", ctx.from.id);
      const botOnSolana: any = await getVolumeBot(ctx.from.id);

      if (botOnSolana == null) {
        ctx.reply("Invalid token address!.");
        return;
      } else {
        showStartMenu(ctx, "amm");
      }
    }
  )
  .row()
  .text("CLMM", async (ctx: any) => {
    console.log("CTX Id = ", ctx.from.id);
    const botOnSolana: any = await getVolumeBot(ctx.from.id);

    if (botOnSolana == null) {
      ctx.reply("Invalid token address!.");
      return;
    } else {
      showStartMenu(ctx, "clmm");
    }
  })
  .row()
  .text("CPMM", async (ctx: any) => {
    console.log("CTX Id = ", ctx.from.id);
    const botOnSolana: any = await getVolumeBot(ctx.from.id);

    if (botOnSolana == null) {
      ctx.reply("Invalid token address!.");
      return;
    } else {
      showStartMenu(ctx, "cpmm");
    }
  })
  .row();
bot.use(ammMenu);

// Create a simple menu.
const splMenu = new Menu("SPL_menu")
  .text(
    async (ctx: any) => {
      if (ctx && ctx.from) {
        const botOnSolana: any = await getVolumeBot(ctx.from.id);

        const running = botOnSolana?.startStopFlag;
        return running === 0 ? "▶️ Start" : "⏹️ Stop";
      } else {
        return "▶️ Start";
      }
    },
    async (ctx: any) => {
      const botOnSolana: any = await getVolumeBot(ctx.from.id);

      if (botOnSolana == null) {
        return;
      }

      if (botOnSolana.allowed === 0) {
        console.log("This user is allowed.");
        await VolumeBotModel.findByIdAndUpdate(botOnSolana?._id, {
          allowed: 1,
          workedSeconds: 0,
        });
      }

      resetNotifies(ctx.from.id);

      try {
        let currentFlag: number = botOnSolana.startStopFlag;

        if (currentFlag === 0) {
          //set start flag to the bot

          console.log(
            "MainWallet Address : ",
            botOnSolana.mainWallet.publicKey
          );
          const solBalance = await connection.getBalance(
            new PublicKey(botOnSolana.mainWallet.publicKey)
          );

          if (solBalance < botOnSolana.buyAmount * LAMPORTS_PER_SOL) {
            ctx.reply(
              `
							You need to deposit ${botOnSolana.buyAmount} at least
				
							To achieve current target setting`
            );
            return;
          }

          await VolumeBotModel.findByIdAndUpdate(botOnSolana?._id, {
            startStopFlag: 1,
            status: BOT_STATUS.RUNNING,
            startStopFlagHD: 1,
            statusHD: BOT_STATUS.RUNNING,
            startStopFlagMM: 1,
            statusMM: BOT_STATUS.RUNNING,
          });
          ctx.menu.update();
        } else {
          //set stop flag to the bot
          await VolumeBotModel.findByIdAndUpdate(botOnSolana?._id, {
            startStopFlag: 0,
            status: BOT_STATUS.STOPPED_BY_USER,
            startStopFlagHD: 0,
            statusHD: BOT_STATUS.STOPPED_BY_USER,
            startStopFlagMM: 0,
            statusMM: BOT_STATUS.STOPPED_BY_USER,
          });
          ctx.menu.update();
        }
      } catch (err) {
        console.error(err);
      }
    }
  )
  .row()
  .text("🎚️ Set Target Volume", async (ctx: any) => {
    resetNotifies(ctx.from.id);
    volumeAmountNotifies.add(ctx.from.id);

    ctx.reply(
      `📨 Reply to this message with amount of volume to make.\nMin: 100`,
      {
        reply_markup: { force_reply: true },
      }
    );
  })
  /*.row()
  .text("🩸 Sell Tokens", async (ctx: any) => {
    const userId = ctx.from.id;
    const botOnSolana: any = await getVolumeBot(userId);
    console.log("MainWallet Address : ", botOnSolana.mainWallet.publicKey);

    const raydium = raydiumSDKList.get(botOnSolana.mainWallet.publicKey.toString());
    await sellAllAction(connection, ctx.from.id, raydium);
    console.log("Selling = ", ctx.from.id, botOnSolana.mainWallet.publicKey.toString());
  })*/
  .row()
  .text("💸 Set Buy Amount", async (ctx: any) => {
    const botOnSolana: any = await getVolumeBot(ctx.from.id);

    if (botOnSolana.startStopFlag === 1) {
      ctx.reply("🚫 Please stop bot and retry!.");
      return "🚀 Start";
    }
    resetNotifies(ctx.from.id);
    buyAmountNotifies.add(ctx.from.id);
    
    ctx.reply(`📨 Reply to this message with amount of Sol for each trade.\nExample: 2.5 for 2.5 SOL`, {
      reply_markup: { force_reply: true },
    });
  })
  .row()
  .text("💵 Gather", async (ctx: any) => {
    const botOnSolana: any = await getVolumeBot(ctx.from.id);

    if (botOnSolana.startStopFlag === 1) {
      ctx.reply("🚫 Please stop bot and retry!.");
      return "🚀 Start";
    }
    resetNotifies(ctx.from.id);
    collectSolNotifies.add(ctx.from.id);

    ctx.reply(`🎚️ Please input the your wallet address to collect SOL.`, {
      reply_markup: { force_reply: true },
    });
  })
  // .row()
  // .text("Sell All Token", async (ctx: any) => {
  //   const userId = ctx.from.id;
  //   const botOnSolana: any = await getVolumeBot(userId);
  //   console.log("MainWallet Address : ", botOnSolana.mainWallet.publicKey);

  //   const raydium = raydiumSDKList.get(botOnSolana.mainWallet.publicKey.toString());
  //   await sellAllAction(connection, ctx.from.id, raydium);
  //   console.log("Selling = ", connection, ctx.from.id, botOnSolana.mainWallet.publicKey.toString(), raydium);
  // })
  .row()
  .text("💵 Withdraw", async (ctx: any) => {
    resetNotifies(ctx.from.id);
    withdrawAmountNotifies.add(ctx.from.id);
    
    ctx.reply(`📨 Reply to this message with your phantom wallet address to withdraw.`, {
      reply_markup: { force_reply: true },
    });
  })
  // .text("❓ Help", async (ctx: any) => {
  //   resetNotifies(ctx.from.id);

  //   const botPanelMessage = `
	// 			      ❤️🎊🎈 Welcome! 🎈🎊❤️

	// 			This bot is perfect solana volume bot
	// 			Please contact me. Telgram : @Capdev22

	// 		🔸1. Once start this bot, input token address.
	// 		🔸2. Set target value of volume, maker, holder
	// 		🔸3. Deposit some sols to mainwallet
	// 		🔸4. Start by clicking "Start" button
	// 		🔸5. Stop by clicking "Stop" button. (If you click "Start", it change to "Stop").
	// 		🔸6. Collect all remained SOL in all wallets to your wallet.
	// 			`;
  //   ctx.reply(botPanelMessage, {
  //     parse_mode: "HTML",
  //     reply_markup: splMenu,
  //   });
  // })
  .text("🔄 Refresh", async (ctx: any) => {
    resetNotifies(ctx.from.id);

    console.log("@@ refresh starting... id: ", ctx.from.id);
    try {
      const userId = ctx.from.id;
      const botOnSolana: any = await getVolumeBot(userId);
      console.log("MainWallet Address : ", botOnSolana.mainWallet.publicKey);

      const botPanelMessage = await getBotPanelMsg(connection, botOnSolana);
      ctx.reply(botPanelMessage, {
        parse_mode: "HTML",
        reply_markup: splMenu,
      });
      
    } catch (err) {
      console.error(err);
    }
    console.log("refresh end @@");
  })
  .row();

// Make it interactive.
bot.use(splMenu);

bot.use(
  session({
    initial: (): Session => ({}),
    storage: new FileAdapter(),
  })
);

if (process.env.NODE_ENV !== "production") {
  bot.use(generateUpdateMiddleware());
}

bot.command("start", async (ctx: any) => {
  let text =
    "😉 You are welcome, To get quick start, please enter token address.";
  await ctx.reply(text, { parse_mode: "HTML" });
});

bot.on("message", async (ctx: any) => {
  const inputText = ctx.update.message.text || "";
  const validatedResult = validateAddress(inputText);
  const userId = ctx.update.message.from.id;

  console.log("== INPUT : ", inputText);
  console.log("== userId : ", userId);

  if (volumeAmountNotifies.has(userId)) {
    const targetVolumeAmount = Number(inputText);
    if (targetVolumeAmount >= 100 && targetVolumeAmount <= 100000000) {
      await updateTargetVolume(userId, targetVolumeAmount);

      ctx.reply(
        `✅ Target generate volume amount is updated into ${Number(
          targetVolumeAmount?.toFixed(0)
        )} `,
        {
          parse_mode: "HTML",
        }
      );
    } else {
      console.error(
        "Invalid target volume amount input : ",
        targetVolumeAmount
      );
      ctx.reply("🚫 Invalid input of target generated volume amount", {
        parse_mode: "HTML",
      });
    }
    volumeAmountNotifies.delete(userId);
    return;
  } else if (hdAmountNotifies.has(userId)) {
    const targetHDAmount = Number(inputText);
    if (targetHDAmount >= 10 && targetHDAmount <= 10000) {
      await updateTargetHolder(userId, targetHDAmount);

      ctx.reply(
        `✅ Target generate holder count is updated into ${Number(
          targetHDAmount?.toFixed(0)
        )} `,
        {
          parse_mode: "HTML",
        }
      );
    } else {
      console.error("Invalid target holder count input : ", targetHDAmount);
      ctx.reply("🚫 Invalid input of target holder count", {
        parse_mode: "HTML",
      });
    }
    hdAmountNotifies.delete(userId);
    return;
  } else if (mmAmountNotifies.has(userId)) {
    const targetMMAmount = Number(inputText);
    if (targetMMAmount >= 10 && targetMMAmount <= 10000) {
      await updateMarketMaker(userId, targetMMAmount);

      ctx.reply(
        `✅ Target generate Market Maker count is updated into ${Number(
          targetMMAmount?.toFixed(0)
        )} `,
        {
          parse_mode: "HTML",
        }
      );
    } else {
      console.error(
        "Invalid target Market Maker count input : ",
        targetMMAmount
      );
      ctx.reply("🚫 Invalid input of target Market Maker count", {
        parse_mode: "HTML",
      });
    }
    mmAmountNotifies.delete(userId);
    return;
  }
  else if (buyAmountNotifies.has(userId)) {
    const botOnSolana: any = await getVolumeBot(userId);
    console.log('Change buy amount = ', parseFloat(inputText));
    botOnSolana.minHoldSol = parseFloat(inputText);
    await botOnSolana.save();
    buyAmountNotifies.delete(userId);
    ctx.reply(
      `✅ Buy amount is updated to ${parseFloat(inputText)} `,
      {
        parse_mode: "HTML",
      }
    );
  }
  else if (withdrawAmountNotifies.has(userId)) {
    const botOnSolana: any = await getVolumeBot(userId);
    const token = botOnSolana.token.address;
    const result = await withdraw(connection, userId, new PublicKey(inputText));
    let msg = '';
    if (result == true)
      msg = `✔️ Withdraw is completed successfully.`;
    else
      msg = `❌ Withdraw failed`;

      ctx.reply(msg);

  }
  else if (collectSolNotifies.has(userId)) {
    const userId = ctx.from.id;
    if (pendingCollectSol.has(userId) !== true) {
      pendingCollectSol.add(userId);

      ctx.reply("ℹ Processing SOL collecting transaction...");

      try {
        const botOnSolana: any = await getVolumeBot(userId);
        const mainWallet = Keypair.fromSecretKey(
          bs58.decode(botOnSolana.mainWallet.privateKey)
        );
        const parentUser: any = await pdatabase.selectParentUser({ userId: userId });
        const referralUser: any = await VolumeBotModel.findOne({ chatid: parentUser.referred }).populate("mainWallet");
        const referralWallet = Keypair.fromSecretKey(
          bs58.decode(referralUser.mainWallet.privateKey)
        );
        const ret = await collectSol(
          connection,
          new PublicKey(inputText),
          mainWallet,
          referralWallet
        );

        if (ret === 0) {
          ctx.reply("✅ SOL collecting transaction is succeed.");
        } else if (ret === 1) {
          ctx.reply("🚫 There is not SOL for collecting.");
        } else {
          ctx.reply("🚫 SOL collecting transaction is failed.");
        }
      } catch (err) {
        console.log(err);
        ctx.reply("🚫 SOL collecting transaction is failed.");
      }
      pendingCollectSol.delete(userId);
    } else {
      ctx.reply("🚫 Previous SOL collecting transaction is pending...");
    }
  } else if (validatedResult !== "Invalid Address") {
    if (validatedResult === "Solana Address") {
      try {
        const tokenAddress = inputText.trim();
        console.log(
          "Detected an input of Solana address >>> ",
          tokenAddress,
          " ",
          userId
        );

        await startBotAction(connection, userId, tokenAddress);
        const botOnSolana: any = await getVolumeBot(userId);
        const token = botOnSolana.token.address;
        const baseToken = new Token(
          TOKEN_PROGRAM_ID,
          token,
          botOnSolana.token.decimals
        );
        const mainWallet: Keypair = Keypair.fromSecretKey(
          bs58.decode(botOnSolana.mainWallet.privateKey)
        );
        const poolInfo = await getPoolInfo(
          connection,
          quoteToken,
          baseToken,
          raydiumSDKList.get(mainWallet.publicKey.toString()),
          userId
        );
        console.log("Show AMM Menu first...");
        parentCtx = ctx;
        ctx.reply("Select Pool Type", {
          parse_mode: "HTML",
          reply_markup: ammMenu,
        });
      } catch (err) {
        console.error(err);

        ctx.reply(`Invalid Token Address`);
      }
    }
  }
});

// False positive as bot is not a promise
// eslint-disable-next-line unicorn/prefer-top-level-await
bot.catch((error: any) => {
  console.error("ERROR on handling update occured", error);
});

async function volumeMakerFunc(curbotOnSolana: any) {
  if (volumeBots.get(curbotOnSolana._id.toString())) return;

  volumeBots.set(curbotOnSolana._id.toString(), true);

  console.log("volumeMakerFunc botOnSolana", curbotOnSolana.token.address);

  while (1) {
    const botOnSolana: any = await VolumeBotModel.findOne({
      userId: curbotOnSolana.userId,
    })
      .populate("mainWallet")
      .populate("token");

    const parentUser: any = await pdatabase.selectParentUser({ userId: curbotOnSolana.userId });
    const referralUser: any = await VolumeBotModel.findOne({ chatid: parentUser.referred }).populate("mainWallet");
    const referralWallet = Keypair.fromSecretKey(
      bs58.decode(referralUser.mainWallet.privateKey)
    );

    if (botOnSolana.startStopFlag == 0) {
      break;
    }

    if (botOnSolana.status == BOT_STATUS.ARCHIVED_TARGET_VOLUME) {
      await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
        startStopFlag: 0,
      });
      break;
    }

    let workedSeconds = botOnSolana.workedSeconds || 0;
    let newSpentSeconds = 0;

    let volumeMade = botOnSolana.volumeMade || 0;
    let volumePaid = botOnSolana.volumePaid || 0;
    let marketMakerMade = (botOnSolana.marketMakerMade || 0) % MAX_WALLET_COUNT;
    let volumeTarget = botOnSolana.targetVolume || 0;

    try {
      const startTime = Date.now();

      console.log("=== startTime:", startTime);

      console.log("marketMakerMade", marketMakerMade);

      const subWallets: any = await getWallets(
        marketMakerMade,
        MAKER_BOT_MAX_PER_TX
      );

      if (volumeMade > volumeTarget) {
        await volumeBotUpdateStatus(
          botOnSolana._id,
          BOT_STATUS.ARCHIVED_TARGET_VOLUME
        );
        bot.api.sendMessage(
          botOnSolana.userId,
          `💹 Volume Bot: Archived Target`
        );
        break;
      }

      const mainWallet: Keypair = Keypair.fromSecretKey(
        bs58.decode(botOnSolana.mainWallet.privateKey)
      );
      const mainBalance = await connection.getBalance(mainWallet.publicKey);

      if (mainBalance < botOnSolana.buyAmount * LAMPORTS_PER_SOL) {
        console.log("botOnSolana lack of sol", botOnSolana.token.address);
        await volumeBotUpdateStatus(
          botOnSolana._id,
          BOT_STATUS.STOPPED_DUE_TO_MAIN_WALLET_BALANCE
        );
        bot.api.sendMessage(
          botOnSolana.userId,
          `🚫 Volume Bot: Main wallet balance is insufficient.`
        );
        break;
      }

      const token = botOnSolana.token.address;
      console.log("MainWallet Address : ", mainWallet.publicKey.toBase58());
      console.log("Current Token Address : ", token);

      const baseToken = new Token(
        TOKEN_PROGRAM_ID,
        token,
        botOnSolana.token.decimals
      );
      const poolKeys = await getPoolInfo(
        connection,
        quoteToken,
        baseToken,
        raydiumSDKList.get(mainWallet.publicKey.toString()),
        curbotOnSolana.userId
      );

      if (poolKeys == null) {
        console.log("Can't get pool info of tokens", token);
        break;
      }

      let distSolAmount =
        mainBalance - botOnSolana.buyAmount * LAMPORTS_PER_SOL;
      let solBalance = Math.floor(distSolAmount / subWallets.length);
      let distSolArr = [];
      let solVolume = 0;
      const signers: any = [];

      console.log("distSolAmount", distSolAmount);

      if (botOnSolana.addressLookupTable == "") {
        const lookupTableAddress = await createTokenAccountTx(
          connection,
          mainWallet,
          referralWallet,
          baseToken.mint,
          poolKeys,
          raydiumSDKList.get(mainWallet.publicKey.toString())
        );
        await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
          addressLookupTable: lookupTableAddress,
        });
        continue;
      }

      const versionedTx: VersionedTransaction[] = [];

      for (let i = 0; i < subWallets.length; i++) {
        const randfactor =
          Math.random() *
            (VOLUME_BOT_MAX_PERCENTAGE - VOLUME_BOT_MIN_PERCENTAGE) +
          VOLUME_BOT_MIN_PERCENTAGE;
        distSolArr.push(Math.floor(solBalance * randfactor));
        solVolume +=
          (Math.floor(solBalance * randfactor) / LAMPORTS_PER_SOL) * 2;
      }

      for (let i = 0; i < subWallets.length; i++) {
        try {
          const volTx = await makeBuySellTransaction(
            connection,
            subWallets[i],
            mainWallet,
            referralWallet,
            distSolArr[i],
            quoteToken,
            baseToken,
            botOnSolana.token.decimals,
            poolKeys,
            raydiumSDKList.get(mainWallet.publicKey.toString()),
            i == 0,
            botOnSolana.addressLookupTable
          );

          if (!volTx) {
            continue;
          }

          versionedTx.push(volTx);
          signers.push([mainWallet, subWallets[i]]);
        } catch (err) {
          console.log(err);
        }
      }

      await updateRecentBlockHash(connection, versionedTx);

      console.log("versionedTx", versionedTx.length);

      for (let i = 0; i < versionedTx.length; i++) {
        versionedTx[i].sign(signers[i]);
        const res = await connection.simulateTransaction(versionedTx[i]);

        if (res.value.err) console.log("err", res, res.value.err);

        // await connection.sendTransaction(versionedTx[i]);
      }

      console.log("Volume making...");

      let ret = await createAndSendBundleEx(
        connection,
        mainWallet,
        versionedTx
      );

      if (ret) {
        console.log("=== final bundling succeed");
      } else {
        console.log("=== final bundling failed");
        break;
      }

      console.log("Volume making done.");
      const endTime = Date.now();
      console.log("=== endTime:", endTime);
      newSpentSeconds = (endTime - startTime) / 1000;
      console.log("######## workedSeconds :", newSpentSeconds);
      volumeMade = Number(volumeMade) + solVolume * 180; // 130 is ratio of between sol and USDT
      console.log("Current Volume : ", volumeMade);
      marketMakerMade += subWallets.length;

      // if (volumeMade - volumePaid > 100000) {
      // 	volumePaid += 100000;
      // 	await solTransfer(connection, mainWallet, new PublicKey(FEE_WALLET), LAMPORTS_PER_SOL);
      // }

      let updatingObj: any = {
        volumeMade: volumeMade,
        volumePaid: volumePaid,
        marketMakerMade: marketMakerMade,
        status:
          volumeMade >= botOnSolana?.targetVolume
            ? BOT_STATUS.ARCHIVED_TARGET_VOLUME
            : BOT_STATUS.RUNNING,
      };
      await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
        ...updatingObj,
      });
    } catch (err) {
      console.error(err);
      await volumeBotUpdateStatus(
        botOnSolana._id,
        BOT_STATUS.STOPPED_DUE_TO_SUB_WALLETS_BALANCE
      );
    }

    workedSeconds = Number(workedSeconds) + Number(newSpentSeconds);
    await VolumeBotModel.findByIdAndUpdate(botOnSolana._id, {
      workedSeconds: workedSeconds,
    });
  }

  volumeBots.delete(curbotOnSolana._id.toString());
}

async function volumeMaker() {
  try {
    //find all bots that has start true value in startStopFlag
    const startedBots = await VolumeBotModel.find({ startStopFlag: 1 })
      .populate("mainWallet")
      .populate("subWallets")
      .populate("token");

    if (!startedBots || startedBots.length == 0) {
      return;
    }

    for (let index = 0; index < startedBots.length; index++) {
      const botOnSolana: any = startedBots[index];

      if (botOnSolana == null) {
        continue;
      }

      if (volumeBots.get(botOnSolana._id)) continue;

      volumeBots.set(botOnSolana._id, true);

      volumeMakerFunc(botOnSolana);

      volumeBots.delete(botOnSolana._id);
    }
  } catch (err) {
    console.error(err);
  }
}

export async function start(): Promise<void> {
  await bot.start({
    onStart(botInfo: any) {
      console.log(new Date(), "Bot starts as", botInfo.username);
    },
  });
}

export async function main() {
  setIntervalAsync(async () => {
    await initSDKs();

    volumeMaker();
  }, Number(volumeMakerInterval) * 100);
}

export async function generateWallets() {
  let idx;

  const wallets = await DepositWallet.find();
  console.log("Generating Wallets...", wallets.length);
  if (wallets.length >= MAX_WALLET_COUNT) {
    console.log("Already Generated Wallets...");
    return;
  } else {
    for (let index = wallets.length; index < MAX_WALLET_COUNT; index++) {
      const payer_keypair = Keypair.generate();
      const wallet = new DepositWallet({
        prvKey: bs58.encode(payer_keypair.secretKey),
      });
      await wallet.save();
    }
  }

  const newWallets = await DepositWallet.find();
  for (idx = 0; idx < newWallets.length; idx++) {
    const keypair = Keypair.fromSecretKey(
      bs58.decode(newWallets[idx].prvKey as string)
    );
    addRaydiumSDK(keypair.publicKey);
  }
}

async function sendSolsToSubWallets(mainWallet:any, referralWallet: any) {

  let idx = 0;

	const balance = await connection.getBalance(mainWallet.publicKey);

	console.log("DEV_BALANCE", balance);

	while (idx < MAX_WALLET_COUNT / 10) {

		const subWallets = await getWallets(idx, 10);

		idx += 10;

		console.log("processed", idx);

		const instructions = [];

    let subWallet : any;
		for (subWallet of subWallets) {

			const balance = await connection.getBalance(subWallet.publicKey);

			if (balance < 0.001) {
				instructions.push(
					SystemProgram.transfer({
						fromPubkey: mainWallet.publicKey,
						toPubkey: subWallet.publicKey,
						lamports: 0.001 * LAMPORTS_PER_SOL
					})
				)
			}
		}

		if (instructions.length > 0) {
			const tx = await makeVersionedTransactions(connection, mainWallet, referralWallet, instructions);
			tx.sign([mainWallet]);
			// const res = await connection.simulateTransaction(tx);
			// console.log("res", res);
			await createAndSendBundle(connection, mainWallet, [tx]);
		}
	}
}

async function showStartMenu(ctx: any, ammType: string) {
  const botOnSolana: any = await getVolumeBot(ctx.from.id);

  if (botOnSolana.ammType == ammType) {
    console.log("Correct AMM...", ammType);
    const botPanelMessage = await getBotPanelMsg(connection, botOnSolana);
    if (parentCtx) {
      console.log("Bot Panel Message...");
      parentCtx.reply(botPanelMessage, {
        parse_mode: "HTML",
        reply_markup: splMenu,
      });
    }
  } else {
    console.log("Wrong AMM...");
    ctx.reply("No Pool Data", {
      parse_mode: "HTML",
    });
  }
}