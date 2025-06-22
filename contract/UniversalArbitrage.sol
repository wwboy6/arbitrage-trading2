// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {ActionConstants} from '@uniswap/v4-periphery/src/libraries/ActionConstants.sol';
import "./helper.sol";

import "hardhat/console.sol";

struct SwapParams {
    uint8 swapProviderIndex;
    // TODO: involve multiple commands
    bytes1 command;
    bytes path;
}

contract UniversalArbitrage is Ownable {
    // PancakeSwap Universal Router address on BSC
    address public constant PANCAKESWAP_UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
    address public constant UNISWAP_UNIVERSAL_ROUTER = 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07;

    bytes1 public constant V3_SWAP_EXACT_IN = hex"00";

    constructor() Ownable(msg.sender) {}

    function attack(
        // TODO: flash loan
        address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) onlyOwner external returns (uint256 amountOut) {
        this.executeMultipleSwaps(tokenIn, amountIn, swaps, deadline);

        // TODO: get balance
        amountOut = IERC20(tokenIn).balanceOf(address(this));
        console.log('balance after swap');
        console.log(amountOut);
        
        require(amountOut > amountIn, "not profitible");

        IERC20(tokenIn).transfer(
            msg.sender,
            amountOut
        );
    }

    function getRouterAddress(uint8 swapProviderIndex) public pure returns (address routerAddress) {
        if (swapProviderIndex == 0) {
            routerAddress = PANCAKESWAP_UNIVERSAL_ROUTER;
        } else {
            routerAddress = UNISWAP_UNIVERSAL_ROUTER;
        }
    }

    // Execute multiple V3 exact input swaps from an array of SwapParams
    function executeMultipleSwaps(
        address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) external onlyOwner {
        require(amountIn > 0, "no amount in provided");
        require(swaps.length > 0, "no swaps provided");
        require(block.timestamp <= deadline, "transaction deadline passed");

        console.log('after verify');
        console.log(tokenIn);
        console.log(amountIn);

        for (uint256 i = 0; i < swaps.length; i++) {
            SwapParams calldata swap = swaps[i];

            console.log(swap.swapProviderIndex);

            address routerAddress = getRouterAddress(swap.swapProviderIndex);

            // transfer balance for swap
            if (i == 0) {
                IERC20(tokenIn).transferFrom(
                    msg.sender,
                    routerAddress,
                    amountIn
                );
            }

            console.log('after transfer');

            // determin recipient
            address recipient;

            if (i < swaps.length - 1) {
                // find next trade router
                recipient = getRouterAddress(swaps[i+1].swapProviderIndex);
                console.log('recipient is next router');
            } else {
                recipient = address(this);
                console.log('recipient is self');
            }

            bytes memory commands = new bytes(1);
            // Set command for V3 exact input swap
            commands[0] = swap.command;
            
            bytes[] memory inputs = new bytes[](1);

            if (swap.command == Commands.V2_SWAP_EXACT_IN) {
                console.log("V2_SWAP_EXACT_IN");
                address[] memory v2Path = abi.decode(swap.path, (address[]));
                inputs[0] = abi.encode(
                    recipient,
                    IERC20(v2Path[0]).balanceOf(routerAddress),
                    0,
                    v2Path,
                    false
                );
            } else {
                console.log("V3");
                inputs[0] = abi.encode(
                    recipient,
                    ActionConstants.CONTRACT_BALANCE,
                    0,
                    swap.path,
                    false
                );
            }

            console.log('before router');

            // Execute swaps via Universal Router
            IUniversalRouter(routerAddress).execute(commands, inputs, deadline);

            console.log('after router');
        }
    }

    // Withdraw tokens from the contract.
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    // Event for tracking swaps (updated to include path)
    event SwapExecuted(bytes indexed path, uint256 amountIn, uint256 amountOut);

    // TODO: // Allow contract to receive BNB
    // receive() external payable {}
    
}
