const express = require('express');
const {CertController} = require("../controllers/certController");
const {DownloadController} = require("../controllers/downloadController");
const {VerifierController} = require("../controllers/verifierController");

const { query, body, validationResult, checkExact} = require('express-validator');
const {handlerErrorRequest} = require("../responseHandlers/handlerErrorRequest");
const appLogger = require("../services/loggers/applogger");
const {validateGasFee, validateHashAlgorithm} = require("./validators/otherValidators");

const router = express.Router();


router.post('/requestCert',
    checkExact([
        body(['owner','user']).exists().isString(),
        body('data').exists().custom((value)=>{
            if(!Array.isArray(value)){
                throw new Error("Expect data array");
            }
            for(let v of value){
                if(typeof v.id !== 'string'){
                    throw new Error("Expect data id to be a string");
                }
                if(!Array.isArray(v.toBeCertified)){
                    throw new Error("Expect array data for each element of data");
                }
                for(let obj of v.toBeCertified){
                    if(typeof obj !== 'object'){
                        throw new Error("Expect each data field to be a JSON object");
                    }
                }
            }
            return true
            }

        ),
        body('hashAlgorithm').optional().isString().custom(validateHashAlgorithm)
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const certController = new CertController();
            await certController.requestCertification(req, res);
        }catch (error){
            appLogger.error({error:error}, `Error while requesting cert`);
            next(error);
        }
    });


router.delete('/abortCert',
    checkExact([
        query(['owner', 'ticket']).exists().isString(),
        query('ticket').isMongoId(),
        query('id').exists().isString()
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const certController = new CertController();
            await certController.abortCertificationRequest(req, res);
        }catch (error){
            appLogger.error({error:error}, `Error while aborting cert`);
            next(error);
        }
    });

router.get('/getGasPrice',
    checkExact([]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const certController = new CertController();
            await certController.getGasPrice(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while getGasPrice`);
            next(error);
        }
    });

router.get('/getTicketStatus',
    checkExact([
        query(['owner', 'ticket']).exists().isString(),
        query('ticket').isMongoId(),
    ]),

    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const certController = new CertController();
            await certController.getTicketStatus(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while getTicketStatus`);
            next(error);
        }
    });

router.post('/certify',
    checkExact([
        body(['owner', 'user']).exists().isString(),
        body('ticket').exists().isString().isMongoId(),
        body('gasPrice').exists().isObject(),
        body('gasPrice.baseFee').exists()
            .custom(value => {
                return validateGasFee(value);
            }),
        body('gasPrice.maxPriorityFeePerGas').exists()
            .custom(value => {
                return validateGasFee(value);
            }),
        body('gasPrice.maxFeePerGas').exists()
            .custom(value => {
                return validateGasFee(value);
            }),
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const certController = new CertController();
            await certController.certifyOwnerDocs(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while certifying`);
            next(error);
        }
    });



router.get('/downloadCert',
    checkExact([
        query(['owner', 'ticket']).exists().isString(),
        query('ticket').isMongoId(),
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const downloadController = new DownloadController();
            await downloadController.downloadCertificationProof(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while downloading cert`);
            next(error);
        }
    });

router.delete('/ackDownload',
    checkExact([
        query(['owner', 'ticket']).exists().isString(),
        query('ticket').isMongoId(),
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const downloadController = new DownloadController();
            await downloadController.deleteCertifiedData(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while acknowledging certification download`);
            next(error);
        }
    })


router.post('/verify',
    checkExact([
        body('proof').exists()
            .custom((value)=>{
                if(Array.isArray(value)){
                    return true
                }else{
                    throw new Error("Wrong format of proof field. It must be stringified before sending it");
                }
                }),
        body('transactionHash')
            .exists().withMessage('transactionHash is required')
            .isString()
            .matches(/^0x[0-9a-fA-F]{64}$/).withMessage('transactionHash must be a 0x-prefixed 32-byte hex string'),


        body('data').exists().custom((value) =>{
            if(Array.isArray(value)){
                return true
            }else{
                throw new Error("Wrong format of data");
            }
        }),
        body('blockchainURL').exists().isURL(),
        body('hashAlgorithm').optional().isString().custom(validateHashAlgorithm)
    ]),
    async (req, res, next) => {
        try{
            const result = validationResult(req);
            if (!result.isEmpty()) {
                return res.status(400).json(handlerErrorRequest({message:result.errors}))
            }
            const verifierController = new VerifierController();
            await verifierController.verify(req, res);
        }catch(error){
            appLogger.error({error:error}, `Error while verifying certification proof`);
            next(error);
        }
    });



module.exports = router;