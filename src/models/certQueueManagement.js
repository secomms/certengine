const {connectToDbMongo} = require("../connectors/mongoDBConnector");
const mongoose = require('mongoose');
const appLogger = require("../services/loggers/applogger");
const { ObjectId } = mongoose.Types;

class CertQueueManagement {

    async #getConnection() {
        return await connectToDbMongo();
    }


    async getQueue(owner, queueID){
        let connection;
        let queryResult;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");

            const nid = new ObjectId(queueID)
            let filter = {"_id": nid, "owner": owner};

            queryResult = await collection.findOne(filter);

        } catch (error) {
            appLogger.error({context:{owner:owner, ticket: queueID},error:error},`Error while getting the queue`);
            throw error;
        }
        return queryResult;
    }

    /**
     * Function to create a new transaction queue inside which document to be certified are temporarily stored.
     * The document created will have the following structure
     *
     * {
     *     _id : "xxxx",
     *     queue: [
     *         {docID:"xxx", owner:"xxxx", userID:"user that requested the certification"},
     *         {docID:"xxx", owner:"xxxx", userID:"user that requested the certification"}
     *     ],
     *     creationTS : timestamp,
     *     locked: true/false
     * }
     *
     * @param data represents information about the document stored inside the queue which are
     *              {docID:"xxx", owner:"xxxx", userID:"user that requested the certification"}
     *              In some cases it may be needed to create a new empty transaction queue because the last one active
     *              has been deleted (certification process completed).
     *              For this reason we admit undefined data
     * @param owner
     * @param algo
     */
    async createNewTransactionQueue(data, owner, algo){
        let connection;
        let queueID;
        const queue = data ? [data] : [];

        try{
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");
            const emptyQueue = {
                queue: queue,
                owner: owner,
                hashAlgo: algo,
                creationTS: new Date().getTime(),
                locked: false,
                readyForDeletion: false
            };
            const temp =  await collection.insertOne(emptyQueue);
            queueID = temp.insertedId;

        } catch (error) {
            appLogger.error({context:{owner:owner},error:error},`Error while creating a new transaction queue`);
            throw error;
        }
        return queueID
    }

    /**
     * Function that retrieves the oldest certification waiting queue still open for new document to be certified.
     * For such queue document, it returns only the data queue in order to append to it new certification requests.
     *
     * @returns the object {queue: [doc0, docN]}
     */
    async getUnlockedQueue(owner, ticket){
        let connection;
        let queryResult;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");
            const nid = new ObjectId(ticket)
            let filter = owner ? {"_id": nid, "owner":owner, "locked": false} : {"locked": false};

            queryResult = await collection.findOne(filter);

        } catch (error) {
            appLogger.error({context:{owner:owner, ticket: ticket}, error:error},`Error while getting the unlocked queue`);
            throw error;
        }
        return queryResult;
    }

    /**
     * Function that adds to the waiting queue references to data for which a certification request has been meade.
     * 1) Store inside variable "data" the references
     * 2) Get the oldest queue still open (locked = false)
     *    2.1) If there isn't an available queue, a new one is created. Else move on
     * 3) Check if the references already exist inside the queue (certification request already made before)
     * 4) If no references are found, add them to the queue
     *
     * @param data {Array<{id:string, data:Object, hashAlgo:string, userID:string}>}
     * @param owner Data owner
     * @param algo Choosen hashing algorithm
     */
    async appendDocumentsToQueue(data, owner, algo){
        let connection;
        let ticket, queueDoc;

        try {
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");

            queueDoc = await collection.findOne({"owner": owner, "locked": false});

            if (!queueDoc) {
                const newQueueID = await this.createNewTransactionQueue(undefined, owner, algo);
                queueDoc = await collection.findOne({"_id": newQueueID});
            }
            if (queueDoc.hashAlgo !== algo) {
                throw new TypeError(`You already uploaded one or more data requesting ${queueDoc.hashAlgo} as hash algorithm. Now you must continue to use it!`)
            }

            let editedQueue = queueDoc.queue.concat(data)

            editedQueue = editedQueue.filter((value, index, self) =>
                index === self.findIndex((obj) => obj.id === value.id)
            );

            if (editedQueue.length !== queueDoc.queue.length) {
                const filter = {"_id": queueDoc._id};
                const update = {$set: {["queue"]: editedQueue}};
                await collection.updateOne(filter, update);
                ticket = queueDoc._id.toString();
            } else {
                ticket = queueDoc._id.toString();
                appLogger.error({}, "Documents you asked to certify are already present!");
            }

        }catch (error){
            appLogger.error({context:{owner:owner, ticket: ticket},error:error},`Error while adding documents to the queue`);
            throw error;
        }

        return ticket
    }


    /**
     * Function that locks an existing queue in order to stop appending new certification requests,
     * because the system is ready to make a transaction
     *
     * @param queueID queue document ID
     */
    async lockQueue(queueID){
        let connection;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection('Queue');

            const filter = {"_id": queueID};
            const update = {$set: {locked: true}};
            await collection.updateOne(filter, update);

        } catch (error) {
            appLogger.error({context:{ticket:queueID}, error:error},`Error while trying to lock the queue`);
            throw error;
        }
    }


    /**
     * Function that unlocks a locked queue because the certification process failed for some reason, so util a new
     * process is started, other requests can be added
     *
     * @param queueID document's id of the queue
     */
    async unlockQueue(queueID){
        let connection;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection('Queue');

            const filter = {"_id": queueID};
            const update = {$set: {locked: false}};
            await collection.updateOne(filter, update);

        } catch (error) {
            appLogger.error({context:{ticket:queueID}, error:error}, `Error while trying to unlock the queue`);
            throw error;
        }
    }


    /**
     * Function that sets the queue ready for its deletion. It is necessary to give a confirmation
     * to solve possible communication problems during certification proof download.
     *
     * @param queueID {string}
     * @param owner {string}
     * @return {Promise<void>}
     */
    async setReadyForDeletion(queueID, owner){
        let connection;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection('Queue');
            const nid = new ObjectId(queueID);
            const filter = {"_id": nid, owner:owner};
            const update = {$set: {readyForDeletion: true}};
            await collection.updateOne(filter, update);
        } catch (error) {
            appLogger.error({context:{owner:owner, ticket:queueID}, error:error},`Error while setting the queue ready to be deleted`);
            throw error;
        }
    }

    /**
     * Function that deletes a waiting queue once the certification process is ended successfully
     *
     * @param queueID queue document ID
     * @param owner
     */
    async deleteQueue(queueID, owner){
        let connection;
        try{
            connection = await this.#getConnection();
            const nid = new ObjectId(queueID);

            let collection = await connection.collection("Queue");
            await collection.deleteOne({ _id: nid, owner:owner, readyForDeletion:true });

        } catch (error) {
            appLogger.error({context:{owner:owner, ticket:queueID}, error:error},`Error while trying to delete the queue`);
            throw error;
        }
    }


    /**
     * Function that drops a document from the waiting queue if the certification request is aborted.
     *
     * @param owner Name of the company
     * @param dataID
     * @param queueID
     */
    async dropDocumentFromQueue(owner, dataID, queueID){
        let connection;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");
            const nid = new ObjectId(queueID);
            let queueDoc = await collection.findOne({_id: nid, owner: owner});
            const isDocIDPresent = queueDoc.queue.some(elem => elem.id === dataID);

            if (isDocIDPresent) {
                if(queueDoc.queue.length!==1){
                    const filteredQueue = queueDoc.queue.filter(elem => elem.id !== dataID);
                    const filter = { "_id": nid };
                    const update = { $set: { "queue": filteredQueue } };
                    await collection.updateOne(filter, update);
                }else{
                    await this.setReadyForDeletion(queueID, owner);
                    await this.deleteQueue(queueID, owner);
                }

            } else {
                appLogger.log(`${dataID} doesn't exist.`);
            }

        } catch (error) {
            appLogger.error({context:{owner:owner, ticket:queueID, dataID:dataID}, error:error},`Error while trying to drop a data from queue`);
            throw error;
        }
    }


    /**
     * Function that adds certification information to the closed queue.
     *
     * @param queueID {string}
     * @param owner {string}
     * @param treeID {ObjectId}
     * @param blockchainData {Object}
     * @param blockchainData.blockchainURL {string}
     * @param blockchainData.blockchainName {string}
     * @param blockchainData.transactionTimestamp {string}
     * @param blockchainData.transactionHash {string}
     * @param blockchainData.userID {string}
     * @return {Promise<void>}
     */
    async addCertInfoToClosedQueue(queueID, owner, treeID, blockchainData){
        let connection;
        try{
            connection = await this.#getConnection();
            let collection = await connection.collection("Queue");
            const nid = new ObjectId(queueID);
            const filter = {"_id": nid, owner:owner};
            const updates = [
                { $set: { "treeID": treeID } },
                { $set: { "blockchainData": blockchainData } }
            ];
            for(let up of updates){
                await collection.updateOne(filter, up);
            }

        } catch (error) {
            appLogger.error({context:{owner:owner, ticket:queueID}, error:error},`Error while trying to add certification infos to a queue`);
            throw error;
        }

    }

}

module.exports = {
    CertificationQueueManagement: CertQueueManagement
}