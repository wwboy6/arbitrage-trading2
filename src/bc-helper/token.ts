import { ChainId, ERC20Token } from "@pancakeswap/sdk";
import { bscTokens as _bscTokens } from "@pancakeswap/tokens";

export const bscTokens = {
  ..._bscTokens,
  zk: new ERC20Token(
    ChainId.BSC,
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    18,
    'BNB',
    'Polyhedra Network',
    'https://polyhedra.network/',
  ),
}