/* eslint-disable prefer-const */
import { BigDecimal, Address } from "@graphprotocol/graph-ts";
import { Pair, Token, Bundle } from "../../../generated/schema";
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from "./index";

const WBNB_ADDRESS = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const BUSD_WBNB_PAIR = "0x6af4c4433474b2f8ba385ad62b23299c82846783"; // created block 7173211
const DAI_WBNB_PAIR = "0x9938f3f25d2a4c8d38b829be9fd5f9554c3c900d"; // created block 7183251
const USDT_WBNB_PAIR = "0x26782a2669d32be87c892ada10aa630d0834b3c4"; // created block 7183335

export function getBnbPriceInUSD(): BigDecimal {
  // fetch bnb prices for each stablecoin
  let usdtPair = Pair.load(USDT_WBNB_PAIR); // usdt is token0
  let busdPair = Pair.load(BUSD_WBNB_PAIR); // busd is token1
  let daiPair = Pair.load(DAI_WBNB_PAIR); // dai is token0

  // all 3 have been created
  if (daiPair !== null && busdPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = daiPair.reserve1.plus(busdPair.reserve0).plus(usdtPair.reserve1);
    let daiWeight = daiPair.reserve1.div(totalLiquidityBNB);
    let busdWeight = busdPair.reserve0.div(totalLiquidityBNB);
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB);
    return daiPair.token0Price
      .times(daiWeight)
      .plus(busdPair.token1Price.times(busdWeight))
      .plus(usdtPair.token0Price.times(usdtWeight));
    // busd and usdt have been created
  } else if (busdPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = busdPair.reserve0.plus(usdtPair.reserve1);
    let busdWeight = busdPair.reserve0.div(totalLiquidityBNB);
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB);
    return busdPair.token1Price.times(busdWeight).plus(usdtPair.token0Price.times(usdtWeight));
    // usdt is the only pair so far
  } else if (busdPair !== null) {
    return busdPair.token1Price;
  } else if (usdtPair !== null) {
    return usdtPair.token0Price;
  } else {
    return ZERO_BD;
  }
}

let WHITELIST: string[] = [
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0x23396cf899ca06c4472205fc903bdb4de249d6fc", // UST
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
  "0x4bd17003473389a42daf6a0a729f6fdb328bbbd7", // VAI
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // WETH
  "0x250632378e573c6be1ac2f97fcdf00515d0aa91b", // BETH
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_BNB = BigDecimal.fromString("1");

/**
 * Search through graph to find derived BNB per token.
 **/
export function findBnbPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD;
  }

  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair.token0 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token1 = Token.load(pair.token1);
        return pair.token1Price.times(token1.derivedBNB as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveBNB.gt(MINIMUM_LIQUIDITY_THRESHOLD_BNB)) {
        let token0 = Token.load(pair.token0);
        return pair.token0Price.times(token0.derivedBNB as BigDecimal); // return token0 per our token * BNB per token 0
      }
    }
  }

  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(bundle: Bundle, pair: Pair, token0: Token, token1: Token): BigDecimal {
  let price0 = token0.derivedBNB.times(bundle.bnbPrice);
  let price1 = token1.derivedBNB.times(bundle.bnbPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return pair.reserve0.times(price0).plus(pair.reserve1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return pair.reserve0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return pair.reserve1.times(price1).times(BigDecimal.fromString("2"));
  }

  return ZERO_BD;
}
