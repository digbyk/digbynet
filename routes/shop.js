'user strict';

var express = require('express');
var router = express.Router();

var logger = require('../lib/logging.js');
var stripe = require('stripe')(process.env.STRIPE_KEY);

var ManagementClient = require('auth0').ManagementClient;
var auth0 = new ManagementClient({
	token: process.env.AUTH0_TOKEN,
	domain: process.env.AUTH0_DOMAIN
});

router.use((req, res, next) => {
	if (req.isAuthenticated()) {
		next();
	} else {
		req.flash('error', 'You must be logged in to do that.')
		res.redirect('/');
	}
});

router.use((req, res, next) => {
	logger.debug('Creating customer');
	auth0.users.get({ id: req.user.user_id })
		.then(user => {
			if (typeof user.app_metadata.customerId != 'undefined') throw new Error('Customer already exists');
			logger.debug(user.app_metadata);
			return stripe.customers.create({ email: user.email });
		})
		.then(customer => {
			logger.debug(customer.id);
			return auth0.users.update({ id: req.user.user_id }, { 'app_metadata': { 'customerId': customer.id } });
		})
		.then(user => {
			logger.debug(user.displayName);
			logger.debug(user.email);
			logger.debug(user.customerId);
			next();
		}).catch(err => {
			if (err.message != 'Customer already exists') {
				logger.debug(err);
				res.redirect('/');
			}
			next();
		});
});

router.get('/', (req, res) => {
	stripe.products.list().then(products => {
		res.render('shop/index', { products: products });
	}).catch(err => {
		logger.log(err);
		res.status(500);
	});
});

router.get('/basket', (req, res) => {
	stripe.customers.retrieve(req.user.app_metadata.customerId)
		.then(function (customer) {
			logger.log(customer);
			res.render('shop/basket', { customer: customer });
		}).catch(function (err) {
			logger.log(err);
			res.status(500);
		});
});

router.post('/charge', (req, res) => {
	logger.log(req.user.app_metadata.customerId);
	stripe.charges.create({
		amount: 1000, // amount in cents, again
		currency: 'gbp',
		customer: req.user.app_metadata.customerId,
		//source: req.body.stripeToken,
		description: 'Example charge'
	}).then(charge => {
		logger.log(charge);
		res.redirect('/shop/basket');
	}).catch(err => {
		logger.log(err);
		res.status(500);
	});
});

router.get('/:productId', (req, res) => {
	stripe.products.retrieve(req.params.productId).then(function (product) {
		res.render('shop/product', { product: product });
	}).catch(err => {
		logger.log(err);
		res.status(500);
	});
});

module.exports = router;