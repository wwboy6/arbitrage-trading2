# Blockchain Arbitrage Trading

This is part 3 of a demo for arbitrage trading. This part is trying to test if any trade route is profitable and then perform the arbitrage attack.

## Workflow Highlight

- Periodically simulate attacks to check if any stated trade route is profitable
  - [node.js] Call loop is limited by p-throttle, once per time period defined as env INTERVAL.
  - [node.js] ArbitrageAttacker.attack: Simulate and perform attack.
    - [Viem] PublicClient.simulateContract: Simulate a write contract call and return value data.
    - [Solidity] CallAndReturnAnySuccess.callAndReturnAnySuccess: Sequentially call a list of functions (attack) and return if any one of them is successful.
    - [Solidity] UniversalArbitrage.attack: Perform arbitrage attack. Return profit on success and revert on fail.
- Update piority fee w.r.t. estimated profit and account balance
- Perform attack with multiple amount values in one tracsaction
  - [node.js] ArbitrageAttacker.getTargetAmounts: Determine amount values to be used.
  - [Solidity] UniversalArbitrage.attackWithAmounts: Sequentially attack with different amount value. when one of them failed, the failed attack would be revert and the successful sub-attacks would be kept.

## Smart Contract Deployed Version

2025-06-28 0x9123D8bC7e6a3a62c1D02D60e79661C5c73c4089

## Review

As this project is still in progress, BNB main chain block time is updated to 0.75 seconds, which make this arbitrage strategy impractical. The time required for write contract call simulation is too long for making attack before next block is evaluated.

Two attacks was performed but it is way too late to get the profitable trading. (See log.txt for detail)

Event message subscription would get latest information of trading swap, which could be a possible way to detect profitable attack. Study about event message is stated in test-watch-event.ts.
