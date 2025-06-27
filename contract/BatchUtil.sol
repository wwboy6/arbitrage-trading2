// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract CallAndReturnAnySuccess is Ownable {
    struct Result {
        uint8 index;
        bool success;
        bytes returnData;
    }

    /**
     * @dev Receives and executes a batch of function calls on this contract with payment.
     * just like other multicall, with some modification.
     * this call would not revert for any sub-call failure
     * data array size cannot excess uint8 max
     */
    function callAndReturnAnySuccess(bytes[] calldata data) external virtual payable onlyOwner returns (Result memory result) {
        require(data.length < type(uint8).max, "too many datas");
        for (result.index = 0; result.index < data.length;) {
            // TODO: verify: msg.value is sent to every call. it assumes every call would not consume the value
            // TODO: check if the sub-call is payable
            // TODO: test if it could invoke private function, which could be dangerous
            (result.success, result.returnData) = address(this).delegatecall(data[result.index]);
            if (result.success) break;
            unchecked { ++result.index; }
        }
    }
}
