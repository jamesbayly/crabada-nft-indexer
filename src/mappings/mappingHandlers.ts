import assert from "assert";
import { TransferLog } from "../types/abi-interfaces/Erc721";
import { Collection, Nft, Transfer } from "../types";
import {
  getCollectionId,
  getNftId,
  getTransferId,
  incrementBigInt,
} from "../utils/common";
import { Erc721__factory } from "../types/contracts";

export async function handleERC721(transferLog: TransferLog): Promise<void> {
  logger.info(
    "encountered crabada transfer on block " +
      transferLog.blockNumber.toString()
  );

  const erc721Instance = Erc721__factory.connect(transferLog.address, api);

  let collection = await Collection.get(
    getCollectionId(chainId, transferLog.address)
  );
  if (!collection) {
    // Collection is new and needs to be created
    const [name, symbol, total_supply] = await Promise.all([
      erc721Instance.name(),
      erc721Instance.symbol(),
      erc721Instance.totalSupply(),
    ]);

    assert(collection, "Missing Collection");
    collection = Collection.create({
      id: getCollectionId(chainId, transferLog.address),
      contract_address: transferLog.address.toLowerCase(),
      created_block: BigInt(transferLog.blockNumber),
      created_timestamp: transferLog.block.timestamp,
      creator_address: transferLog.transaction.from,
      total_supply: total_supply.toBigInt(),
      name,
      symbol,
    });
    await collection.save();
  }

  try {
  } catch {}
  assert(transferLog.args, "No event args on erc721");

  const nftId = getNftId(collection.id, transferLog.args.tokenId.toString());

  let nft: Nft | undefined = await Nft.get(nftId);
  if (!nft) {
    // There is not an existing NFT in the store, create a new one
    let metadataUri;
    try {
      // metadata possibly undefined
      // nft can share same metadata
      // if collection.name and symbol exist, meaning there is metadata on this contract
      metadataUri =
        collection.name || collection.symbol
          ? await erc721Instance.tokenURI(transferLog.args.tokenId)
          : undefined;
    } catch (e) {}

    nft = Nft.create({
      id: nftId,
      tokenId: transferLog.args.tokenId.toString(),
      collectionId: collection.id,
      minted_block: BigInt(transferLog.blockNumber),
      minted_timestamp: transferLog.block.timestamp,
      minter_address: transferLog.transaction.from,
      current_owner: transferLog.args.to,
      metadata_url: metadataUri,
    });

    try {
      collection.total_supply = (await erc721Instance.totalSupply()).toBigInt();
    } catch (e) {
      collection.total_supply = incrementBigInt(collection.total_supply);
    }

    await Promise.all([collection.save(), nft.save()]);
  }

  // Create the transfer record
  const transferId = getTransferId(
    chainId,
    transferLog.transactionHash,
    transferLog.logIndex.toString(),
    0
  );

  const transfer = Transfer.create({
    id: transferId,
    tokenId: transferLog.args.tokenId.toString(),
    block: BigInt(transferLog.blockNumber),
    timestamp: transferLog.block.timestamp,
    transaction_hash: transferLog.transactionHash,
    nftId: nft.id,
    from: transferLog.args.from,
    to: transferLog.args.to,
  });

  await transfer.save();
}
