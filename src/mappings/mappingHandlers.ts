import assert from "assert";
import { Transfer, Address } from "../types";
import { getTransferId } from "../utils/common";
import {
  MintBatchTransaction,
  NewCrabLog,
  TransferLog,
} from "../types/abi-interfaces/Crabada";
import { Crabada__factory } from "../types/contracts/factories/Crabada__factory";
import { Crab } from "../types/models/Crab";
import { EthereumLog } from "@subql/types-ethereum";
const CRABADA_DEPLOYER_ADDRESS = "0xe48b3a0Dc82bE39bBa7b895c9ff1d788a54Edc47";
const NEW_CRAB_LOG_SIGNATURE =
  "0x8685605608394b7362c2b08010c2f925065dada447fe050634fcddb1bdb05980";

async function checkCreateAddress(id: string): Promise<Address> {
  let address = await Address.get(id.toLowerCase());
  if (!address) {
    address = Address.create({
      id: id.toLowerCase(),
    });
    await address.save();
  }
  return address;
}

export async function handleNewCrab(
  batchTx: MintBatchTransaction
): Promise<void> {
  logger.info(
    "encountered New Crab Mint on block " + batchTx.blockNumber.toString()
  );
  if (batchTx.logs) {
    const crabLogs = batchTx.logs?.filter((l) =>
      l.topics.includes(NEW_CRAB_LOG_SIGNATURE)
    ) as NewCrabLog[];
    logger.info(`processing ${crabLogs.length.toString()} crabs`);
    logger.info(JSON.stringify(crabLogs[0]));
    for (const newCrabLog of crabLogs.filter(
      (l) => !l.args?.daddyId && !l.args?.mommyId
    )) {
      // Process one that don't have a daddy or mommy
      assert(newCrabLog.args, "Requires args");
      const erc721Instance = Crabada__factory.connect(newCrabLog.address, api);
      const account = await checkCreateAddress(newCrabLog.args.account);
      const minterAddress = await checkCreateAddress(
        newCrabLog.transaction.from
      );

      let metadataUri;
      try {
        // metadata possibly undefined
        // nft can share same metadata
        // if collection.name and symbol exist, meaning there is metadata on this contract
        metadataUri = await erc721Instance.tokenURI(newCrabLog.args.id);
      } catch (e) {}

      const nft = Crab.create({
        id: newCrabLog.args.id.toString(),
        addressId: account.id,
        dna: newCrabLog.args.dna.toBigInt(),
        birthday: newCrabLog.args.birthday.toBigInt(),
        breeding_count: newCrabLog.args.breedingCount,
        minted_block: BigInt(newCrabLog.blockNumber),
        minted_timestamp: newCrabLog.block.timestamp,
        minter_addressId: minterAddress.id,
        current_ownerId: account.id,
        metadata_url: metadataUri,
      });

      await nft.save();
    }

    for (const newCrabLog of crabLogs.filter(
      (l) => l.args?.daddyId || l.args?.mommyId
    )) {
      // Process remainder
      assert(newCrabLog.args, "Requires args");
      const erc721Instance = Crabada__factory.connect(newCrabLog.address, api);
      const account = await checkCreateAddress(newCrabLog.args.account);
      const daddy = await Crab.get(newCrabLog.args.daddyId.toString());
      const mommy = await Crab.get(newCrabLog.args.mommyId.toString());
      const minterAddress = await checkCreateAddress(
        newCrabLog.transaction.from
      );

      let metadataUri;
      try {
        // metadata possibly undefined
        // nft can share same metadata
        // if collection.name and symbol exist, meaning there is metadata on this contract
        metadataUri = await erc721Instance.tokenURI(newCrabLog.args.id);
      } catch (e) {}

      const nft = Crab.create({
        id: newCrabLog.args.id.toString(),
        addressId: account.id,
        daddyId: daddy?.id,
        mommyId: mommy?.id,
        dna: newCrabLog.args.dna.toBigInt(),
        birthday: newCrabLog.args.birthday.toBigInt(),
        breeding_count: newCrabLog.args.breedingCount,
        minted_block: BigInt(newCrabLog.blockNumber),
        minted_timestamp: newCrabLog.block.timestamp,
        minter_addressId: minterAddress.id,
        current_ownerId: account.id,
        metadata_url: metadataUri,
      });

      await nft.save();
    }
  }
}

export async function handleERC721(transferLog: TransferLog): Promise<void> {
  logger.info(
    "encountered crabada transfer on block " +
      transferLog.blockNumber.toString()
  );

  assert(transferLog.args, "No event args on erc721");

  const nftId = transferLog.args.tokenId.toString();
  logger.info(nftId);

  let crab = await Crab.get(nftId);

  assert(crab, "Crab can't be found");

  const fromAddress = await checkCreateAddress(transferLog.args.from);
  const toAddress = await checkCreateAddress(transferLog.args.to);

  // Create the transfer record
  const transfer = Transfer.create({
    id: `${transferLog.transactionHash}-${transferLog.logIndex.toString()}`,
    tokenId: transferLog.args.tokenId.toString(),
    block: BigInt(transferLog.blockNumber),
    timestamp: transferLog.block.timestamp,
    transaction_hash: transferLog.transactionHash,
    crabId: crab.id,
    fromId: fromAddress.id,
    toId: toAddress.id,
  });

  await transfer.save();
}
