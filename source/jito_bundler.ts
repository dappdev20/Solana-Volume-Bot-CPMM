import * as JitoAPI from './jitoAPI';
import * as utils from './utils/common';
import { JITO_BUNDLE_TIP,} from "./bot/const";
  

const JITO_AUTH_KEYS = [
	'qYVSiZtoqhswnyjXyRgnoHtnwpapRfkFUz3H6k2XZrwR7zcZ7bzA9Exh3s17GfppTBfn44r1Tw4ycgtWixaYXML',
	'3mZKuu9zuvt1nZpSwNJ31owHqZniPUFxp8Ps2ybdcvBVJo2zY4Hp6PqEe4koDYG5cFtuxXfQAzoYyekJ52n87tZS'
]

export class JitoBundler {
	private jitoKeys: string[] = []
	private usedKeyindex: number = 0

	public constructor() {
		this.jitoKeys = JITO_AUTH_KEYS
	}

	private getAPIKey = () => {
		this.usedKeyindex++
		if (this.usedKeyindex >= this.jitoKeys.length) {
			this.usedKeyindex = 0
		}
		return this.jitoKeys[this.usedKeyindex]
	}

	public sendBundles = async (bundleTransactions: any[], payer: any, maxRetry: number = 3): Promise<boolean> => {
		const len: number = bundleTransactions.length
		// console.log("jito requesting ", len);

		if (!bundleTransactions.length || bundleTransactions.length > 5) {
			return false
		}
		const result: boolean = await JitoAPI.createAndSendBundleTransaction(bundleTransactions, payer ? payer.wallet : null, this.getAPIKey(), JITO_BUNDLE_TIP)
		if (!result && maxRetry - 1 > 0) {
			await utils.sleep(500)
			// console.log("jito retrying... ", len);
			return await this.sendBundles(bundleTransactions.slice(0, len), payer, maxRetry - 1)
		}
		return result
	}
}