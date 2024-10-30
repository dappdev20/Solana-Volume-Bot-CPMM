import mongoose from 'mongoose';

const ParentDatabase = () => {
console.log('init parentdatabase...');
    let db: mongoose.Connection = mongoose.createConnection(`mongodb://localhost:27017/${process.env.PARENT_DB_NAME}`)
console.log('parentdatabase connected...');
    const ParentUser = db.model(
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
        })
    );

    const selectParentUser = (params: any) => {
        return new Promise(async (resolve, reject) => {
            ParentUser.findOne(params).then(async (user) => {
                resolve(user);
            });
        });
    }

    return {
        selectParentUser
    }
}

export default ParentDatabase;