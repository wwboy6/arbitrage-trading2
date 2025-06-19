// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// TODO: this seems hard to use
// import "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";

interface IUniversalRouter {
    struct V3ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable returns (bytes[] memory);
}

struct SwapParams {
    int8 swapProviderIndex;
    bytes[] paths;
}

contract MultiSwapArray is Ownable {
    // PancakeSwap Universal Router address on BSC
    address public constant PANCAKESWAP_UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
    address public constant UNISWAP_UNIVERSAL_ROUTER = 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07;

    bytes1 public constant V3_SWAP_EXACT_IN = 0x00;

    constructor() Ownable(msg.sender) {}

    function attack(
        // TODO: flash loan
        // address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) onlyOwner external {
        require(amountIn > 0, "no amount in provided");
        require(swaps.length > 0, "no swaps provided");
        require(block.timestamp <= deadline, "transaction deadline passed");

        uint256 amountOut = this.executeMultipleSwaps(amountIn, swaps, deadline);

        require(amountOut > amountIn, "not profitible");

        // Extract tokenIn from path (first 20 bytes)
        address tokenIn = address(bytes20(swaps[0].paths[0][:20]));
        IERC20(tokenIn).transfer(
            msg.sender,
            amountOut
        );
    }

    // Execute multiple V3 exact input swaps from an array of SwapParams
    function executeMultipleSwaps(
        uint256 amountIn,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) external onlyOwner returns (uint256 amountOut) {

        for (uint256 i = 0; i < swaps.length; i++) {
            SwapParams calldata swap = swaps[i];

            address routerAddress;
            if (swap.swapProviderIndex == 0) {
                routerAddress = PANCAKESWAP_UNIVERSAL_ROUTER;
            } else {
                routerAddress = UNISWAP_UNIVERSAL_ROUTER;
            }

            // Extract tokenIn from path (first 20 bytes)
            address tokenIn = address(bytes20(swap.paths[0][:20]));

            // transfer balance for swap
            if (i == 0) {
                IERC20(tokenIn).transferFrom(
                    msg.sender,
                    routerAddress,
                    amountIn
                );
            } else {
                IERC20(tokenIn).transfer(
                    routerAddress,
                    IERC20(tokenIn).balanceOf(address(this))
                );
            }

            bytes memory commands = new bytes(swap.paths.length);
            bytes[] memory inputs = new bytes[](swap.paths.length);

            for (uint8 j = 0; j < swap.paths.length; j++) {
                // Set command for V3 exact input swap
                commands[j] = V3_SWAP_EXACT_IN;

                // Construct input for Universal Router
                inputs[j] = abi.encode(
                    IUniversalRouter.V3ExactInputParams({
                        path: swap.paths[j],
                        recipient: address(this),
                        deadline: deadline,
                        amountIn: 0, // ActionConstants.CONTRACT_BALANCE
                        amountOutMinimum: 0 // no minimum amount out
                    })
                );
            }

            // Execute swaps via Universal Router
            bytes[] memory outputs = IUniversalRouter(routerAddress).execute(commands, inputs, deadline);

            // Decode outputs
            for (uint8 j = 0; j < outputs.length; j++) {
                // TODO: would this cost many gas? esp for large path
                amountOut = abi.decode(outputs[j], (uint256));
                emit SwapExecuted(swap.paths[j], amountIn, amountOut);
            }
        }
        // amountOut would be the final one
    }

    // Withdraw tokens from the contract. This is for safety only
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    // Event for tracking swaps (updated to include path)
    event SwapExecuted(bytes indexed path, uint256 amountIn, uint256 amountOut);

    // TODO: // Allow contract to receive BNB
    // receive() external payable {}
}
