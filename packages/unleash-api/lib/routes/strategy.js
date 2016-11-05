'use strict';

const BPromise = require('bluebird');
const eventType = require('../event-type');
const logger = require('../logger');
const NameExistsError = require('../error/name-exists-error');
const ValidationError = require('../error/validation-error.js');
const NotFoundError = require('../error/notfound-error');
const validateRequest = require('../error/validate-request');
const extractUser = require('../extract-user');
const version = 1;

module.exports = function (app, config) {
    const strategyStore = config.strategyStore;
    const eventStore = config.eventStore;

    app.get('/strategies', (req, res) => {
        strategyStore.getStrategies().then(strategies => {
            res.json({ version, strategies });
        });
    });

    app.get('/strategies/:name', (req, res) => {
        strategyStore.getStrategy(req.params.name)
            .then(strategy => {
                res.json(strategy);
            })
            .catch(() => {
                res.status(404).json({ error: 'Could not find strategy' });
            });
    });

    app.delete('/strategies/:name', (req, res) => {
        const strategyName = req.params.name;

        strategyStore.getStrategy(strategyName)
            .then(() => eventStore.store({
                type: eventType.strategyDeleted,
                createdBy: extractUser(req),
                data: {
                    name: strategyName,
                },
            }))
            .then(() => {
                res.status(200).end();
            })
            .catch(NotFoundError, () => {
                res.status(404).end();
            })
            .catch(err => {
                logger.error(`Could not delete strategy=${strategyName}`, err);
                res.status(500).end();
            });
    });

    app.post('/strategies', (req, res) => {
        req.checkBody('name', 'Name is required').notEmpty();
        req.checkBody('name', 'Name must match format ^[0-9a-zA-Z\\.\\-]+$').matches(/^[0-9a-zA-Z\\.\\-]+$/i);

        const newStrategy = req.body;

        validateRequest(req)
            .then(validateStrategyName)
            .then(() => eventStore.store({
                type: eventType.strategyCreated,
                createdBy: extractUser(req),
                data: newStrategy,
            }))
            .then(() => res.status(201).end())
            .catch(NameExistsError, () => {
                res.status(403)
                    .json([{ msg: `A strategy named '${req.body.name}' already exists.` }])
                    .end();
            })
            .catch(ValidationError, () => res.status(400).json(req.validationErrors()))
            .catch(err => {
                logger.error('Could not create strategy', err);
                res.status(500).end();
            });
    });

    function validateStrategyName (req) {
        return new BPromise((resolve, reject) => {
            strategyStore.getStrategy(req.body.name)
                .then(() => {
                    reject(new NameExistsError('Feature name already exist'));
                }, () => {
                    resolve(req);
                });
        });
    }
};
