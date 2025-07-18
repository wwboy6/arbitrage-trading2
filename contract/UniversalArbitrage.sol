// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import "./helper.sol";
import "./aave.sol";
import "./IERC20Wrapped.sol";
import "./BatchUtil.sol";

// import "hardhat/console.sol";

struct SwapParams {
    uint8 swapProviderIndex;
    // TODO: involve multiple commands
    bytes1 command;
    bytes path;
}

contract UniversalArbitrage is CallAndReturnAnySuccess {
    // BSC V4: 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB
    // BSC V3: 0x1A0A18AC4BECDDbd6389559687d1A73d8927E416
    address internal pancakeswapUniversalRouter;
    
    // BSC: 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07
    address internal uniswapUniversalRouter;

    // BSC: 0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D
    // ETH: 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e
    IAavePoolAddressesProvider internal loanPoolProvider;
    
    // BSC: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
    IERC20Wrapped internal WBNB;

    constructor(address psur, address usur, address alpp, address wb) Ownable(msg.sender) {
        pancakeswapUniversalRouter = psur;
        uniswapUniversalRouter = usur;
        loanPoolProvider = IAavePoolAddressesProvider(alpp);
        WBNB = IERC20Wrapped(wb);
    }

    function updatePancakeswapUniversalRouter(address addr) external onlyOwner {
        pancakeswapUniversalRouter = addr;
    }

    function updateUniswapUniversalRouter(address addr) external onlyOwner {
        uniswapUniversalRouter = addr;
    }

    function updateLoanPoolProvider(address addr) external onlyOwner {
        loanPoolProvider = IAavePoolAddressesProvider(addr);
    }
    
    function attackWithAmounts(
        address tokenIn,
        uint256[] calldata attackAmounts,
        SwapParams[] calldata swaps,
        uint256 profitMin
    ) onlyOwner external payable {
        require(attackAmounts.length < type(uint8).max, "too many amounts");
        require(swaps.length < type(uint8).max, "too many swaps");
        // console.log("-------------- attackWithAmounts ---------------");
        uint256 currentBalance = IERC20(tokenIn).balanceOf(address(this));
        // if (tokenIn == address(WBNB) && address(this).balance > 0) {
        //     WBNB.deposit{value: address(this).balance}();
        // }
        // uint256 originalBalance = IERC20(tokenIn).balanceOf(address(this));
        // uint256 currentBalance = originalBalance;
        uint256 amountInAvailable = IERC20(tokenIn).balanceOf(msg.sender);
        uint8 i;
        for (i = 0; i < attackAmounts.length;) {
            // console.log("-------------- new target amount ---------------");
            uint256 attackAmount = attackAmounts[i];
            // console.log(attackAmount);

            // handle WBNB deposit with contract balance
            if (
                tokenIn == address(WBNB) &&
                address(this).balance > 0 &&
                attackAmount > currentBalance
            ) {
                if (attackAmount - currentBalance >= address(this).balance) {
                    currentBalance += address(this).balance;
                    WBNB.deposit{value: address(this).balance}();
                } else {
                    // console.log('too many value is transferred');
                    // console.log(attackAmount - currentBalance);
                    WBNB.deposit{value: attackAmount - currentBalance}();
                    currentBalance = attackAmount;
                }
            }

            if (currentBalance > attackAmount) {
                // note: cannot reduce currentBalance here as executeMultipleSwaps would use all current balance
                // console.log("too many balance in the contract");
                attackAmount = currentBalance;
            }

            uint256 amountIn;
            if (amountInAvailable > attackAmount - currentBalance) amountIn = attackAmount - currentBalance;
            else amountIn = amountInAvailable;
            if (amountIn > 0) {
                // transfer required balance to this contract. not using amountIn in executeMultipleSwaps
                IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
                currentBalance += amountIn;
                amountInAvailable -= amountIn;
            }

            (bool success, bytes memory result) = address(this).call(
                abi.encodeWithSelector(
                    this.loanOrPerformAttack.selector,
                    tokenIn,
                    attackAmount,
                    currentBalance,
                    swaps,
                    0 // accept the profit no matter what
                )
            );
            if (!success) {
                // console.log("fail");
                break;
            }
            if (abi.decode(result, (uint256)) - currentBalance < profitMin) break; // stop if the profit is too low to try next level
            currentBalance = abi.decode(result, (uint256));
            unchecked { ++i; }
        }
        if (i == 0) revert("not forfitable");
        // console.log("stop looping");
        // console.log(currentBalance);
        if (tokenIn == address(WBNB)) {
            WBNB.withdraw(currentBalance);
            payable(msg.sender).transfer(currentBalance);
        } else {
            IERC20(tokenIn).transfer(
                msg.sender,
                currentBalance
            );
        }
    }

    function attack(
        address tokenIn,
        uint256 attackAmount,
        SwapParams[] calldata swaps,
        uint256 profitMin
    ) onlyOwner external payable returns (uint256) {
        // console.log("------------------ attack --------------------");
        // console.log("attackAmount");
        // console.log(attackAmount);

        uint256 currentBalance = IERC20(tokenIn).balanceOf(address(this));

        // handle WBNB deposit with contract balance
        if (
            tokenIn == address(WBNB) &&
            address(this).balance > 0 &&
            attackAmount > currentBalance
        ) {
            if (attackAmount - currentBalance >= address(this).balance) {
                currentBalance += address(this).balance;
                WBNB.deposit{value: address(this).balance}();
            } else {
                // console.log('too many value is transferred');
                // console.log(attackAmount - currentBalance);
                WBNB.deposit{value: attackAmount - currentBalance}();
                currentBalance = attackAmount;
            }
        }

        // console.log("currentBalance");
        // console.log(currentBalance);

        if (currentBalance > attackAmount) {
            // console.log("too many balance in the contract");
            // note: cannot reduce currentBalance here as executeMultipleSwaps would use all current balance
            attackAmount = currentBalance;
        }
        
        uint256 amountIn = IERC20(tokenIn).balanceOf(msg.sender);
        if (amountIn > attackAmount - currentBalance) amountIn = attackAmount - currentBalance;

        // console.log("amountIn");
        // console.log(amountIn);

        if (amountIn > 0) {
            // transfer all balance to this contract. not using amountIn in executeMultipleSwaps
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            currentBalance += amountIn;
        }

        uint256 amountOut = loanOrPerformAttack(
            tokenIn,
            attackAmount,
            currentBalance,
            swaps,
            profitMin
        );

        if (tokenIn == address(WBNB)) {
            WBNB.withdraw(amountOut);
        } else {
            IERC20(tokenIn).transfer(
                msg.sender,
                amountOut
            );
        }
        if (address(this).balance > 0) {
            // transfer amount out and excess balance
            payable(msg.sender).transfer(address(this).balance);
        }

        return amountOut - currentBalance;
    }

    function loanOrPerformAttack(
        address tokenIn,
        uint256 attackAmount,
        uint256 currentBalance,
        SwapParams[] calldata swaps,
        uint256 profitMin
    ) public returns (uint256 amountOut) {
        // if (msg.sender != owner() && msg.sender != address(this)) revert("access denied");
        if (_msgSender() != owner() && _msgSender() != address(this)) revert OwnableUnauthorizedAccount(_msgSender());
        if (attackAmount > currentBalance) {
            // console.log("get loan");
            // console.log(attackAmount - currentBalance);
            address pool = loanPoolProvider.getPool();
            // console.log("pool");
            // console.log(pool);
            IAavePool(pool).flashLoanSimple(
                address(this),
                tokenIn,
                attackAmount - currentBalance,
                abi.encode(swaps), // TODO: study if it is costly
                0
            );
        } else {
            performAttack(tokenIn, swaps);
        }

        // console.log("after attack");

        // compare balance
        amountOut = IERC20(tokenIn).balanceOf(address(this));
        // console.log("balance after swap");
        // console.log(amountOut);
        // console.log(currentBalance);
        // console.log(profitMin);
        
        require(amountOut - currentBalance >= profitMin, "not profitable");

        // console.log("attack success");
        emit AttackPerformed(tokenIn, currentBalance, attackAmount, amountOut);
    }

    // callback from simple AAVE flash load (flashLoanSimple)
    function executeOperation(
        address tokenIn,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        // console.log("executeOperation");
        // console.log(tokenIn);
        // console.log(amount);
        // console.log(premium);

        require(msg.sender == loanPoolProvider.getPool(), "Unauthorized");
        require(initiator == address(this), "Invalid initiator");

        // Decode params except swaps, which remains in calldata
        // ( , uint256 deadline) = 
        //     abi.decode(params, (SwapParams[], uint256));
        // Extract swaps directly from calldata using assembly
        SwapParams[] calldata swaps;
        assembly {
            // let offset := add(params.offset, mul(0, 0x20)) // Skip first n fields
            let offset := params.offset
            swaps.offset := add(calldataload(offset), add(params.offset, 0x20))
            swaps.length := calldataload(sub(swaps.offset, 0x20))
        }

        // console.log("before executeOperation performAttack");
        // console.log(swaps.length);

        // executeMultipleSwaps would use up all amount held by this contract
        performAttack(tokenIn, swaps);

        // console.log("after executeOperation performAttack");
        
        IERC20(tokenIn).approve(address(msg.sender), amount + premium);
        return true;
    }

    function performAttack(
        address tokenIn,
        SwapParams[] calldata swaps
    ) private {
        // assume entire input amount is already transferred to this contract
        // TODO: other logics?
        // executeMultipleSwaps would use up all amount held by this contract
        _executeMultipleSwaps(tokenIn, 0, swaps);
    }

    function getRouterAddress(uint8 swapProviderIndex) public view returns (address routerAddress) {
        if (swapProviderIndex == 0) {
            routerAddress = pancakeswapUniversalRouter;
        } else {
            routerAddress = uniswapUniversalRouter;
        }
    }

    function executeMultipleSwaps(
        address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps
    ) public onlyOwner {
        require(swaps.length < type(uint8).max, "too many swaps");
        _executeMultipleSwaps(tokenIn, amountIn, swaps);
    }

    // Execute multiple V3 exact input swaps from an array of SwapParams
    function _executeMultipleSwaps(
        address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps
    ) private {
        // console.log("executeMultipleSwaps");
        // console.log(block.timestamp);

        require(swaps.length > 0, "no swaps provided");

        // console.log("after verify");
        // console.log(tokenIn);
        // console.log(amountIn);

        for (uint8 i = 0; i < swaps.length; i++) {
            SwapParams calldata swap = swaps[i];

            // console.log("swap");
            // console.log(i);
            // console.log("command");
            // console.log(uint8(swap.command));

            // console.log(swap.swapProviderIndex);

            address routerAddress = getRouterAddress(swap.swapProviderIndex);

            // transfer balance for swap
            if (i == 0) {
                if (amountIn > 0) {
                    IERC20(tokenIn).transferFrom(
                        msg.sender,
                        routerAddress,
                        amountIn
                    );
                }
                // also use all balance of this contract
                uint256 balance = IERC20(tokenIn).balanceOf(address(this));
                require(amountIn + balance > 0, "no input for trading");
                if (balance > 0) {
                    IERC20(tokenIn).transferFrom(
                        address(this),
                        routerAddress,
                        balance
                    );
                }
            }

            // console.log("after transfer");

            // determin recipient
            address recipient;

            if (i < swaps.length - 1) {
                // find next trade router
                recipient = getRouterAddress(swaps[i+1].swapProviderIndex);
                // console.log("recipient is next router");
            } else {
                recipient = address(this);
                // console.log("recipient is self");
            }

            bytes memory commands = new bytes(1);
            // Set command for V3 exact input swap
            commands[0] = swap.command;
            
            bytes[] memory inputs = new bytes[](1);

            if (swap.command == Commands.V2_SWAP_EXACT_IN) {
                // console.log("V2_SWAP_EXACT_IN");
                address[] memory v2Path = abi.decode(swap.path, (address[]));
                inputs[0] = abi.encode(
                    recipient,
                    IERC20(v2Path[0]).balanceOf(routerAddress),
                    0,
                    v2Path,
                    false
                );
            } else {
                // console.log("V3");
                inputs[0] = abi.encode(
                    recipient,
                    ActionConstants.CONTRACT_BALANCE,
                    0,
                    swap.path,
                    false
                );
            }

            // console.log("before router");

            // Execute swaps via Universal Router
            IUniversalRouter(routerAddress).execute(commands, inputs, type(uint256).max);


            // console.log("after router");
        }
        // emit SwapPerformed(tokenIn, amountIn);
    }

    receive() external payable {}

    // Withdraw tokens from the contract.
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    function withdrawBalance() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    // Event for tracking swaps
    // event SwapPerformed(address tokenIn, uint256 amountIn);
    event AttackPerformed(address tokenIn, uint256 currentBalance, uint256 attackAmount, uint256 amountOut);

    event FailToWithdraw();

}
