// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import "./helper.sol";
import "./aave.sol";
import "./IERC20Wrapped.sol";

import "hardhat/console.sol";

struct SwapParams {
    uint8 swapProviderIndex;
    // TODO: involve multiple commands
    bytes1 command;
    bytes path;
}

contract UniversalArbitrage is Ownable {
    // TODO: fetch constant from contructor
    address internal constant PANCAKESWAP_UNIVERSAL_ROUTER = 0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB;
    address internal constant UNISWAP_UNIVERSAL_ROUTER = 0x1906c1d672b88cD1B9aC7593301cA990F94Eae07;
    // address public constant AAVE_POOL_PROVIDER = 0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e;
    IAavePoolAddressesProvider internal loanPoolProvider = IAavePoolAddressesProvider(0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e);
    
    /// @notice used to signal that an action should use the owner's entire balance of a currency
    /// This value is equivalent to 1<<255, i.e. a singular 1 in the most significant bit.
    uint256 internal constant OWNER_BALANCE = 0x8000000000000000000000000000000000000000000000000000000000000000;

    IERC20Wrapped internal constant WBNB = IERC20Wrapped(0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c);

    constructor() Ownable(msg.sender) {}

    function attack(
        // TODO: flash loan
        address tokenIn,
        uint256 amountIn,
        uint256 loanTarget,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) onlyOwner external payable returns (uint256 amountOut) {
        if (tokenIn == address(WBNB)) {
            WBNB.deposit{value: address(this).balance - 1}();
            WBNB.deposit{value: 1}();
        }
        if (amountIn == OWNER_BALANCE) {
            // get all balance of sender
            amountIn = IERC20(tokenIn).balanceOf(msg.sender);
        }
        console.log("amountIn");
        console.log(amountIn);

        uint256 totalAmountIn = IERC20(tokenIn).balanceOf(address(this)) + amountIn;
        console.log("totalAmountIn");
        console.log(totalAmountIn);
        console.log("loanTarget");
        console.log(loanTarget);

        console.log("before attack");

        if (loanTarget > totalAmountIn) {
            console.log("get loan");
            IAavePool(loanPoolProvider.getPool()).flashLoanSimple(
                address(this),
                tokenIn,
                loanTarget - totalAmountIn,
                abi.encode(
                    amountIn, swaps, deadline
                ),
                0
            );
        } else {
            performAttack(tokenIn, amountIn, swaps, deadline);
        }

        console.log("after attack");

        // compare balance
        amountOut = IERC20(tokenIn).balanceOf(address(this));
        console.log("balance after swap");
        console.log(amountOut);
        
        require(amountOut > totalAmountIn, "not profitible");

        console.log("attack success");
        emit AttackPerformed(tokenIn, amountIn, loanTarget);
        console.log("wtf1");

        // FIXME: not sure why withdraw is not working in anvil
        /*
        if (tokenIn == address(WBNB)) {
            console.log("wtf2");
            amountOut = IERC20(tokenIn).balanceOf(address(this));
            console.log(amountOut);
            // unwarp and transfer back
            // WBNB.withdraw(amountOut);
            // WBNB.withdraw(test, address(WBNB));
            console.log("wtf3");
            // Note: ignore error for transfer
            payable(msg.sender).transfer(amountOut); // TODO: supress warning
            console.log("wtf4");
        } else {
            IERC20(tokenIn).transfer(
                msg.sender,
                amountOut
            );
        }
        console.log("wtf5");
        */
        IERC20(tokenIn).transfer(
            msg.sender,
            amountOut
        );
    }

    // callback from simple AAVE flash load (flashLoanSimple)
    function executeOperation(
        address tokenIn,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        console.log("executeOperation");
        console.log(amount);
        console.log(premium);

        require(msg.sender == loanPoolProvider.getPool(), "Unauthorized");
        require(initiator == address(this), "Invalid initiator");

        // // TODO: use ByteLab to handle array in encoded bytes
        // (uint256 amountIn, SwapParams[] memory swaps, uint256 deadline) = 
        //     abi.decode(params, (uint256, SwapParams[], uint256));

        // Decode params except swaps, which remains in calldata
        (uint256 amountIn, , uint256 deadline) = 
            abi.decode(params, (uint256, SwapParams[], uint256));
        // Extract swaps directly from calldata using assembly
        SwapParams[] calldata swaps;
        assembly {
            let offset := add(params.offset, mul(4, 0x20)) // Skip first 4 fields (address, uint256, uint256, uint256)
            swaps.offset := add(calldataload(offset), add(params.offset, 0x20))
            swaps.length := calldataload(sub(swaps.offset, 0x20))
        }

        console.log("before executeOperation performAttack");
        console.log(swaps.length);

        // Note that amountIn is the amount that still holding by caller
        // executeMultipleSwaps would use up all amount held by this contract
        performAttack(tokenIn, amountIn, swaps, deadline);

        console.log("after executeOperation performAttack");
        
        IERC20(tokenIn).approve(address(msg.sender), amount + premium);
        return true;
    }

    function performAttack(
        address tokenIn,
        uint256 amountIn,
        SwapParams[] calldata swaps,
        uint256 deadline
    ) private {
        // TODO: other logics?
        // Note that amountIn is the amount that still holding by caller
        // executeMultipleSwaps would use up all amount held by this contract
        executeMultipleSwaps(tokenIn, amountIn, swaps, deadline);
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
    ) public onlyOwner {
        console.log("executeMultipleSwaps");
        console.log(block.timestamp);
        console.log(deadline);

        require(swaps.length > 0, "no swaps provided");
        require(block.timestamp <= deadline, "transaction deadline passed");

        console.log("after verify");
        console.log(tokenIn);
        console.log(amountIn);

        for (uint8 i = 0; i < swaps.length; i++) {
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
                // also use all balance of this contract
                uint256 balance = IERC20(tokenIn).balanceOf(address(this));
                if (balance > 0) {
                    IERC20(tokenIn).transferFrom(
                        address(this),
                        routerAddress,
                        balance
                    );
                }
            }

            console.log("after transfer");

            // determin recipient
            address recipient;

            if (i < swaps.length - 1) {
                // find next trade router
                recipient = getRouterAddress(swaps[i+1].swapProviderIndex);
                console.log("recipient is next router");
            } else {
                recipient = address(this);
                console.log("recipient is self");
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

            console.log("before router");

            // Execute swaps via Universal Router
            IUniversalRouter(routerAddress).execute(commands, inputs, deadline);


            console.log("after router");
        }
        // emit SwapPerformed(tokenIn, amountIn);
    }

    // Withdraw tokens from the contract.
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    function withdrawBalance() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    // Event for tracking swaps
    // event SwapPerformed(address tokenIn, uint256 amountIn);
    event AttackPerformed(address tokenIn, uint256 amountIn, uint256 loanTarget);

}
