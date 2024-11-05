import mongoose from 'mongoose';

let db: mongoose.Connection;
let ParentUser: any;
const ParentDatabase = () => {
    if (db == undefined) {
        console.log('init parentdatabase');
        db = mongoose.createConnection(`mongodb://127.0.0.1:27017/${process.env.PARENT_DB_NAME}`)
    
        ParentUser = db.model(
            "ParentUser",
            new mongoose.Schema({
                chatid: String,
                username: String,
                depositWallet: String,
                addr: String,
                referral: String,
                referred: String,
                timestamp: Number,
                coupon: Number,
                affiliateWallet: String,
                isAffiliated: { type: Boolean, default: false },
            })
        );
        console.log('initialized parentdatabase...');
    }

    const selectParentUser = (params: any) => {
        return new Promise(async (resolve, reject) => {
            ParentUser.findOne(params).then(async (user: any) => {
                resolve(user);
            });
        });
    }

    const updateUser = (params: any) => {
        return new Promise(async (resolve, reject) => {
            ParentUser.findOne({ chatid: params.chatid }).then(async (user: any) => {
                if (!user) {
                    user = new ParentUser();
                }
    
                user.chatid = params.chatid;
                user.username = params.username;
                user.addr = params.addr;
                user.depositWallet = params.depositWallet;
                user.referral = params.referral ?? "";
                user.referred = params.referred ?? "";
                user.coupon = params.coupon?? 100;
                user.affiliateWallet = params.affiliateWallet?? "";
                user.isAffiliated = params.isAffiliated;
                await user.save();
    
                resolve(user);
            });
        });
    };

    return {
        selectParentUser,
        updateUser
    }
}

export default ParentDatabase;