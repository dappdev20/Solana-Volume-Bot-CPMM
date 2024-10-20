const DepositWallet = require('../engine');

export async function addWallet(params: any) {
    return new Promise(async (resolve, reject) => {
      const item = new DepositWallet();
      item.timestamp = new Date().getTime();
  
      item.prvKey = params.prvKey;
      await item.save();
  
      resolve(item);
    });
  }
  
  export async function udpateWallet() {
    return new Promise(async (resolve, reject) => {
      try {
        await DepositWallet.updateMany({}, { usedTokenIdx: "" });
        resolve(true);
      } catch (err) {
        resolve(false);
      }
    });
  }
  
  export async function countWallets(params: any = {}) {
    return new Promise(async (resolve, reject) => {
      DepositWallet.countDocuments(params).then(async (dcas: any) => {
        resolve(dcas);
      });
    });
  }
  
  export async function selectWallets(params: any = {}, limit: number = 0) {
    return new Promise(async (resolve, reject) => {
      if (limit) {
        DepositWallet.find(params)
          .limit(limit)
          .then(async (dcas: any) => {
            resolve(dcas);
          });
      } else {
        DepositWallet.find(params).then(async (dcas: any) => {
          resolve(dcas);
        });
      }
    });
  }