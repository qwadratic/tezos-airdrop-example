import smartpy as sp

FA2 = sp.import_template("FA2.py")


class Fishcake(FA2.FA2):
    def __init__(self, admin):
        FA2.FA2.__init__(self, FA2.FA2_config(single_asset=True), admin)
        
        
class FishcakeBox(sp.Contract):
    def __init__(self, reward, token, tokenAddress=None):
        self.token = token
        if tokenAddress is None:
            tokenAddress = self.token.address

        self.init(
            distributed = 0,
            reward = reward,
            token = tokenAddress,
            receivers = sp.set([]))

    @sp.entry_point
    def redeem(self):
        sp.verify(~self.data.receivers.contains(sp.sender))
        
        token = sp.contract(
            self.token.batch_transfer.get_type(), 
            self.data.token, 
            entry_point="transfer").open_some()
        sp.transfer([
            sp.record(
                from_=sp.self_address, 
                txs=[sp.record(to_=sp.sender, token_id=0, amount=self.data.reward)]
            )], sp.tez(0), token)
        
        self.data.distributed += self.data.reward
        self.data.receivers.add(sp.sender)
    
    @sp.view(sp.TBool)
    def hasRedeemed(self, address):
        sp.result(self.data.receivers.contains(address))


if "templates" not in __name__:
    @sp.add_test(name = "FishcakeBox")
    def test():
        scenario = sp.test_scenario()
        scenario.h1("FishcakeBox")
        
        admin = sp.test_account("Administrator")
        user1 = sp.test_account("User 1")
        user2 = sp.test_account("User 2")
        user3 = sp.test_account("User 3")
        scenario.show([admin, user1, user2])
        
        token = Fishcake(admin.address)
        box = FishcakeBox(reward=5, token=token, tokenAddress=sp.address('KT1WVtyDPFzjMkdkihX22LR4y5ye9kGYxjvF'))

        scenario += token
        scenario += box
        
        scenario += token.mint(address=box.address, amount=100000, symbol='FISH', token_id=0).run(sender=admin)
        
        scenario += box
        scenario += box.redeem().run(sender=user1)
        scenario += box.redeem().run(sender=user2)
        scenario += box.redeem().run(sender=user1, valid=False)
