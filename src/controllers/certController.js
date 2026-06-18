const {CertificationQueueManagement} = require("../models/certQueueManagement");
const {MktreeManagement} = require("../models/mktreeManagement");

const {transactOnBC} = require("../services/transactions/certification/certifier");
const {fromGweiToWei} = require("../services/transactions/oracols/common");
const redisClient = require("../services/redis/redisClient");
const {getAdjustedGasPriceBasedOnTransactionsConcurrency} = require("../services/transactions/oracols");
const appLogger = require("../services/loggers/applogger");

const {handlerSuccessRequest} = require("../responseHandlers/handlerSuccessRequest");
const {handlerErrorRequest} = require("../responseHandlers/handlerErrorRequest");
const {hashingMethod} = require("../utils/common");
const {StatsManagement} = require("../models/statsManagement");
const {getSenderAddress, getSenderAccount} = require("../connectors/blockchainConnector");



class CertController{
    constructor(){
        this.queueManager = new CertificationQueueManagement();
        this.treeManager = new MktreeManagement();
        this.statsManager = new StatsManagement();
    }

    async requestCertification(req, res){
        const owner = req.body.owner;
        const userID = req.body.user;
        const data = req.body.data;
        const hashAlgo = req.body.hashAlgorithm? req.body.hashAlgorithm : 'sha256';

        let ticket;
        let docs = []
        try {
            for(const elem of data){
                const hash = hashingMethod(hashingMethod(elem.toBeCertified, hashAlgo), hashAlgo);
                docs.push({id:elem.id, data:hash, hashAlgo: hashAlgo, userID: userID})
            }

            ticket = await this.queueManager.appendDocumentsToQueue(docs, owner, hashAlgo);

            return res.status(200).json(handlerSuccessRequest(ticket));

        } catch (error) {
            if(error instanceof TypeError){
                return res.status(400).json(handlerErrorRequest(error));
            }
            appLogger.error({context:{owner:owner}, error:error}, `Error while requesting the cert`);
            return res.status(500).json(handlerErrorRequest({message:"Internal Server Error"}));
        }

    }

    /**
     * Function that aborts a certification request for a given document
     * @param req
     * @param req.query.id {string}
     * @param req.query.owner {string}
     * @param req.query.ticket {string}
     * @param res
     * @returns {Promise<void>}
     */
    async abortCertificationRequest(req, res){
        const owner = req.query.owner;
        const dataID = req.query.id;
        const ticket = req.query.ticket;
        try {
            await this.queueManager.dropDocumentFromQueue(owner, dataID, ticket);
            return res.status(200).json(handlerSuccessRequest());
        } catch (error) {
            appLogger.error({context:{dataID:dataID, owner:owner}, error:error},`Error while aborting the certification request`);
            return res.status(500).json(handlerErrorRequest({message:"Internal Server Error"}));
        }
    }


    async getGasPrice(req, res){
        const address = await getSenderAddress()
        let result;
        try {
            result = await redisClient.getPriceAndTransactions(address);
            if(!result){
                return res.status(500).json(handlerErrorRequest({message:"Error while fetching gas prices"}));
            }
            const doc = await getAdjustedGasPriceBasedOnTransactionsConcurrency(result.price, result.transactions);
            if(doc){
                return res.status(200).json(handlerSuccessRequest(doc));
            }else{
                return res.status(500).json(handlerErrorRequest({message:"Error while fetching gas prices"}));
            }
        } catch (error) {
            appLogger.error({error:error},`Error while getting gas price`);
            return res.status(500).json(handlerErrorRequest({message:"Internal Server Error"}));
        }
    }

    async getTicketStatus(req, res){
        const owner = req.query.owner;
        const ticket = req.query.ticket;
        try {
            let queue = await this.queueManager.getQueue(owner, ticket)
            if(!queue){
                return res.status(404).json(handlerErrorRequest({message:"Ticket not found"}));
            }
            let status;
            if(queue.locked){
                if(queue.blockchainData?.transactionHash){
                    status ="To be downloaded";
                }else{
                    status="Transacting";
                }
            }else{
                status = "Open";
            }
            return res.status(200).json(handlerSuccessRequest({status:status}));
        } catch (error) {
            appLogger.error({error:error},`Error while checking ticket status`);
            return res.status(500).json(handlerErrorRequest({message:"Internal Server Error"}));
        }
    }


    async certifyOwnerDocs(req, res){
        const owner = req.body.owner;
        const userID = req.body.user;
        const ticket = req.body.ticket;

        let gasPrice = req.body.gasPrice;
        gasPrice.baseFee = fromGweiToWei(gasPrice.baseFee)
        gasPrice.maxFeePerGas = fromGweiToWei(gasPrice.maxFeePerGas)
        gasPrice.maxPriorityFeePerGas = fromGweiToWei(gasPrice.maxPriorityFeePerGas)

        const sender = await getSenderAccount()

        let queueDoc;

        try{
            queueDoc = await this.queueManager.getUnlockedQueue(owner, ticket);
            if(!queueDoc){
                return res.status(404).json(handlerErrorRequest({message:"Waiting queue not found!"}));
            }
            await this.queueManager.lockQueue(queueDoc._id);
            let leaves = queueDoc.queue.map(item => item.data);
            if(leaves.length === 0){
                await this.queueManager.unlockQueue(queueDoc._id)
                return res.status(404).json(handlerErrorRequest({message:"No documents to be certified"}));
            }

            const hashAlgo = queueDoc.hashAlgo;
            let tree = this.treeManager.getMerkleTree(leaves, false, hashAlgo);
            const root = tree.getMerkleRoot();

            let transactionData;
            transactionData = await transactOnBC(root, gasPrice, sender)
            if(!transactionData){
                return res.status(400).json(handlerErrorRequest({message:"Data could not be certified"}));
            }
            transactionData['userID'] = userID;
            const treeID = await this.treeManager.saveTree(tree);

            await this.queueManager.addCertInfoToClosedQueue(ticket, owner, treeID, transactionData)
            await this.statsManager.addTransactionToHistory(transactionData, owner, sender.address)
            return res.status(200).json(handlerSuccessRequest(transactionData));

        }catch (error) {
            appLogger.error({context: {owner:owner, ticket:ticket, gasPrice:gasPrice}, error:error}, "Error while trying to certify documents");
            if(queueDoc){
                await this.queueManager.unlockQueue(queueDoc._id);
                if(error.name === "InvalidGasOrGasPrice"){
                    return res.status(400).json(handlerErrorRequest({message:"Insufficient Gas given"}));
                }
            }
            return res.status(500).json(handlerErrorRequest({message:"Internal Server Error"}));
        }
    }



}

module.exports = {
    CertController
}